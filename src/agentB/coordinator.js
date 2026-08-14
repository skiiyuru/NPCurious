import { Protocols } from "../comms/protocols.js"
import { summarizeState } from "../llm/prompts.js"
import { createToolCatalog } from "./tools.js"
import { parseToolCall } from "./decide.js"
import {
  buildMissionPrompt,
  formatPeerStatus,
  formatToolCatalog,
} from "./coordinatorPrompts.js"
import { errorMessage } from "../utils/errors.js"

/**
 * @typedef {{
 *   client?: import('../types.js').LLMClient,
 *   logger?: import('../types.js').Logger,
 *   maxSteps?: number
 * }} CoordinatorOptions
 */

/**
 * @typedef {{
 *   tools: import('../types.js').Tool[],
 *   runMission: (mission: string, meta?: { from?: string, name?: string }) => Promise<{ final?: string | null, steps: Array<Object<string, *>>, error?: string }>,
 *   getPeerStatus: () => import('../types.js').StatusReport | null
 * }} CoordinatorHandle
 */

/**
 * Attach LLM coordinator to a live BDI Agent B. Adds three behaviors on top of the BDI player:
 *  1. Team awareness — tracks Agent A's STATUS_REPORT broadcasts.
 *  2. Mission intake — plain game-chat messages become missions; typed coordination JSON is ignored.
 *  3. Iterative LLM tool loop — one tool call per turn, observes result, adapts until `final` or budget exhausted.
 * Missions are queued FIFO so two chat lines never interleave their transcripts.
 * @param {ReturnType<import('../agent.js').createBdiAgent>} agent
 * @param {CoordinatorOptions} [options]
 * @returns {CoordinatorHandle}
 */
export function attachCoordinator(
  agent,
  { client, logger = console, maxSteps = 15 } = {}
) {
  const { beliefs, intentions, bus, socket } = agent

  /** @type {import('../types.js').StatusReport | null} */
  let peerStatus = null
  bus.on(
    Protocols.STATUS_REPORT,
    (/** @type {import('../types.js').StatusReport} */ msg) => {
      peerStatus = msg
    }
  )

  /**
   * Speak plain text into game chat; directed when `to` is given, else shout.
   * @param {string} text
   * @param {string} [to]
   */
  function chat(text, to) {
    const body = String(text ?? "").trim()
    if (!body) return
    if (to && typeof socket?.emitSay === "function") socket.emitSay(to, body)
    else if (typeof socket?.emitShout === "function") socket.emitShout(body)
  }

  const tools = createToolCatalog({
    beliefs,
    intentions,
    bus,
    getPeerStatus: () => peerStatus,
    chat,
  })
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))
  const catalogText = formatToolCatalog(tools)

  /**
   * Run the iterative tool loop for one mission.
   * Rebuilds prompt each turn with fresh observation + transcript.
   * Invalid replies and failing tools become corrective notes — never crashes.
   * @param {string} mission
   * @param {{ from?: string, name?: string }} [meta]
   * @returns {Promise<{ final?: string | null, steps: Array<Object<string, *>>, error?: string }>}
   */
  async function runMissionNow(mission, { from, name } = {}) {
    const canGenerate = typeof client?.generate === "function"
    const available =
      canGenerate &&
      (typeof client?.isAvailable !== "function" || client.isAvailable())
    if (!available) {
      logger.warn?.("[agentB] LLM not configured; ignoring mission:", mission)
      return { error: "LLM not configured", steps: [] }
    }
    const llm = /** @type {import('../types.js').LLMClient} */ (client)

    /** @type {import('./coordinatorPrompts.js').LoopHistoryEntry[]} */
    const history = []
    /** @type {Array<Object<string, *>>} */
    const steps = []

    for (let step = 0; step < maxSteps; step++) {
      const observation = [
        summarizeState(beliefs, intentions),
        formatPeerStatus(peerStatus),
      ].join("\n")
      const prompt = buildMissionPrompt({
        mission,
        from: name ?? from,
        catalog: catalogText,
        observation,
        history,
      })

      let raw
      try {
        raw = await llm.generate(prompt)
      } catch (e) {
        history.push({
          note: `LLM error (${e?.message ?? e}); retrying with shorter context`,
        })
        if (history.length > 3) history.splice(0, history.length - 3)
        continue
      }
      /** @type {import('../types.js').ToolCall} */
      let call
      try {
        call = parseToolCall(raw)
      } catch (error) {
        const message = errorMessage(error)
        history.push({
          note: `your previous reply was invalid (${message}); reply with exactly one JSON object`,
        })
        logger.warn?.("[agentB] invalid tool call:", message)
        continue
      }

      if (call.final !== undefined) {
        logger.log?.("[agentB] final:", call.final)
        chat(/** @type {string} */ (call.final), from)
        return { final: call.final, steps }
      }

      const tool = toolsByName.get(/** @type {string} */ (call.tool))
      let result
      if (!tool) {
        result = `error: unknown tool "${call.tool}"`
      } else {
        try {
          result = String(tool.execute(call.args ?? {}) ?? "ok")
        } catch (error) {
          result = `error: ${errorMessage(error)}`
        }
      }

      steps.push({ tool: call.tool, args: call.args, result })
      history.push({
        call: JSON.stringify({ tool: call.tool, args: call.args }),
        observation: result,
      })
      logger.log?.(
        "[agentB] tool",
        call.tool,
        JSON.stringify(call.args ?? {}),
        "->",
        result
      )
    }

    logger.warn?.(
      "[agentB] mission stopped: step budget reached after",
      maxSteps,
      "steps"
    )
    return { final: null, steps }
  }

  // FIFO queue: serializes missions so two loops never interleave transcripts.
  /** @type {Promise<*>} */
  let queueTail = Promise.resolve()
  /**
   * Enqueue mission behind any running mission; returns its own result promise.
   * @param {string} mission
   * @param {{ from?: string, name?: string }} [meta]
   * @returns {Promise<{ final?: string | null, steps: Array<Object<string, *>>, error?: string }>}
   */
  function runMission(mission, meta) {
    const run = queueTail.then(() => runMissionNow(mission, meta))
    queueTail = run.catch(() => {})
    return run
  }

  // Mission intake: plain chat text = mission; typed coordination JSON has a `protocol` field.
  bus.on(
    "inbound",
    (
      /** @type {{ from?: string, name?: string, payload?: any }} */ {
        from,
        name,
        payload,
      }
    ) => {
      if (!payload || payload.protocol) return
      const text = typeof payload.text === "string" ? payload.text.trim() : ""
      if (!text) return
      logger.log?.(
        "[agentB] chat mission from",
        name ?? from ?? "?",
        "->",
        text
      )
      runMission(text, { from, name }).catch((error) => {
        console.error("[agentB] mission failed:", error)
      })
    }
  )

  return { tools, runMission, getPeerStatus: () => peerStatus }
}
