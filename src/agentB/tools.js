import { applyUserCommand, validateCommand } from "../llm/adapter.js"
import { summarizeState } from "../llm/prompts.js"
import { Protocols } from "../comms/protocols.js"
import { BeliefEvents } from "../beliefs/events.js"
import { formatPeerStatus } from "./coordinatorPrompts.js"

/**
 * @typedef {{
 *   beliefs: import('../types.js').Beliefs,
 *   intentions: import('../types.js').IntentionQueue,
 *   bus: import('../types.js').MessageBus,
 *   getPeerStatus: () => import('../types.js').StatusReport | null,
 *   chat?: (text: string, to?: string) => void
 * }} ToolCatalogDeps
 */

/**
 * Tool catalog wrapping Agent B's BDI capabilities for the LLM tool loop.
 * Local actions go through `applyUserCommand`; each `execute` returns an observation string.
 * @param {ToolCatalogDeps} deps
 * @returns {import('../types.js').Tool[]}
 */
export function createToolCatalog({
  beliefs,
  intentions,
  bus,
  getPeerStatus,
  chat,
}) {
  /**
   * Apply a validated command to B's own beliefs/intention queue and wake the BDI loop.
   * @param {import('../types.js').Command} command
   * @returns {string}
   */
  function applyLocal(command) {
    const result = applyUserCommand(command, beliefs, intentions)
    if (result.applied) {
      beliefs.emit(BeliefEvents.CHANGED, { type: "assigned" })
      return `ok: ${result.reason}${result.text ? ` — ${result.text}` : ""}`
    }
    return `rejected: ${result.reason}${result.text ? ` — ${result.text}` : ""}`
  }

  /** @type {import('../types.js').Tool[]} */
  const tools = [
    {
      name: "observe",
      args: "{}",
      description:
        "Re-read your live world state and the teammate status (use after acting or waiting).",
      execute: () =>
        [
          summarizeState(beliefs, intentions),
          formatPeerStatus(getPeerStatus()),
        ].join("\n"),
    },
    {
      name: "move_to",
      args: '{"x":number,"y":number}',
      description:
        "Walk yourself (Agent B) to a coordinate; it becomes your top-priority intention.",
      execute: ({ x, y }) => {
        const targetX = Number(x)
        const targetY = Number(y)
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
          throw new Error('move_to requires numeric "x" and "y"')
        }
        return applyLocal({ type: "move", target: { x: targetX, y: targetY } })
      },
    },
    {
      name: "pickup",
      args: '{"parcelId":"p1"}',
      description:
        "Go pick up a specific parcel yourself (the id must appear in the observation).",
      execute: ({ parcelId }) => {
        if (typeof parcelId !== "string" || parcelId.length === 0) {
          throw new Error('pickup requires a "parcelId" string')
        }
        return applyLocal({
          type: "add_intention",
          intention: { type: "pickup", parcelId },
        })
      },
    },
    {
      name: "deliver",
      args: '{"parcelIds":["p1"]}',
      description:
        'Deliver carried parcels to the nearest zone; omit "parcelIds" to deliver everything you carry.',
      execute: ({ parcelIds } = {}) => {
        const intention = /** @type {import('../types.js').Option} */ ({
          type: "deliver",
        })
        if (parcelIds !== undefined) {
          if (
            !Array.isArray(parcelIds) ||
            parcelIds.some((id) => typeof id !== "string")
          ) {
            throw new Error(
              'deliver "parcelIds" must be an array of parcel id strings'
            )
          }
          intention.parcelIds = parcelIds
        }
        return applyLocal({ type: "add_intention", intention })
      },
    },
    {
      name: "set_policy",
      args: '{"carryCapacity":3,"lockedCapacity":true,"agentStealRiskWeight":0.2}',
      description:
        "Tune your BDI strategy. To deliver stacks of exactly N parcels, set carryCapacity=N and lockedCapacity=true. Other keys: agentStealRiskWeight, rewardDecayPerStep.",
      execute: (args) => {
        if (!args || typeof args !== "object" || Object.keys(args).length === 0)
          throw new Error(
            "set_policy requires a non-empty policy object as args"
          )
        return applyLocal({ type: "set_policy", policy: args })
      },
    },
    {
      name: "add_constraint",
      args: '{"avoidTiles":[{"x":3,"y":3}]}',
      description:
        "Store a constraint on your own behavior (e.g. tiles to avoid); args is the constraint object.",
      execute: (args) => {
        if (
          !args ||
          typeof args !== "object" ||
          Object.keys(args).length === 0
        ) {
          throw new Error(
            "add_constraint requires a non-empty constraint object as args"
          )
        }
        return applyLocal({ type: "constraint", constraint: args })
      },
    },
    {
      name: "assign_to_teammate",
      args: "<one command object from the command list>",
      description:
        'Delegate one BDI command to Agent A over the team channel. A is a full BDI agent — use "move" to send A to a location where parcels are, and A will pick up and deliver autonomously. Do NOT use pickup with parcel ids unless A can already see that parcel. Do NOT send deliver unless A is already carrying. To pause A, send set_policy with {"paused":true}; to resume A, send set_policy with {"paused":false}.',
      execute: (args) => {
        const command = validateCommand(
          /** @type {import('../types.js').Command} */ (args)
        )
        const peer = getPeerStatus()
        const targetId = peer?.agentId ?? null
        if (targetId)
          bus.tell(targetId, Protocols.ASSIGN_TASK, { targetId, command })
        else bus.broadcast(Protocols.ASSIGN_TASK, { targetId, command })
        const carrying = peer?.carrying?.length ?? 0
        return `ok: ${command.type} sent to teammate A${targetId ? ` (${targetId})` : " (id unknown, broadcast)"}. A is carrying ${carrying} parcels and will deliver autonomously after pickup.`
      },
    },
    {
      name: "send_chat",
      args: '{"text":"...","to":"<agent id, optional>"}',
      description:
        'Say something in the game chat (directed when "to" is given, otherwise broadcast).',
      execute: ({ text, to }) => {
        if (typeof text !== "string" || text.trim().length === 0) {
          throw new Error('send_chat requires a non-empty "text" string')
        }
        if (typeof chat !== "function")
          throw new Error("chat channel is not available")
        chat(text.trim(), typeof to === "string" && to ? to : undefined)
        return "ok: message sent to game chat"
      },
    },
    {
      name: "pause",
      args: "{}",
      description:
        'Stop your BDI loop from moving or acting. Use set_policy with {"paused":false} to resume.',
      execute: () => {
        beliefs.strategy.paused = true
        return "ok: BDI loop paused — agent will not move until resumed"
      },
    },
    {
      name: "resume",
      args: "{}",
      description:
        "Resume your BDI loop after being paused. The agent will continue autonomous parcel collection and delivery.",
      execute: () => {
        beliefs.strategy.paused = false
        beliefs.emit(BeliefEvents.CHANGED, { type: "resumed" })
        return "ok: BDI loop resumed — agent will continue autonomous behavior"
      },
    },
    {
      name: "wait",
      args: '{"seconds":5}',
      description:
        "Pause your BDI loop for the given number of seconds, then automatically resume.",
      execute: ({ seconds }) => {
        const ms = Math.max(1, Math.min(60, Number(seconds) || 5)) * 1000
        beliefs.strategy.paused = true
        setTimeout(() => {
          beliefs.strategy.paused = false
          beliefs.emit(BeliefEvents.CHANGED, { type: "resumed" })
        }, ms)
        return `ok: paused for ${ms / 1000}s, will auto-resume`
      },
    },
  ]

  return tools
}
