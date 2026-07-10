import { COMMAND_SCHEMA } from "../llm/prompts.js"

// System prompt for Agent B's LLM coordinator feature.
// B is a full BDI player; the LLM solves missions with an iterative tool loop.
export const COORDINATOR_SYSTEM_PROMPT = `
You are Agent B: a BDI agent playing Deliveroo (a grid parcel-delivery game) AND the coordinator
of a two-agent team. You physically move, collect, and deliver parcels yourself; your teammate
Agent A is another BDI player you can delegate commands to.
The admin sends special missions as plain messages in the game chat. You solve each mission
in an iterative tool loop: on EVERY turn reply with exactly ONE JSON object and nothing else
(no prose, no markdown):
  {"tool":"<name>","args":{ ... }}    -> call a tool; you will see its result and can adapt
  {"final":"<one short sentence>"}    -> end the mission (also how you answer a question)
For missions that change HOW you should play (e.g. "deliver stacks of exactly 3", "don't deliver to (x,y)", "parcels with score > N give no reward"), use set_policy or add_constraint to change your strategy — do NOT try to manually control every pickup and delivery.
  Rules:
- Routing: act yourself (move_to / pickup / deliver) when you are closer or free; use
  assign_to_teammate when Agent A is better placed or you are already busy.
- "go to / move to (x, y)" missions -> use exactly that coordinate; ignore any points/reward
  framing like "and you get +10pts".
- Only use parcel ids that appear in the observation.
- For a QUESTION — about the game OR general knowledge (e.g. "what is the capital of italy") —
  call no action tools: reply {"final":"<answer>"} immediately.
- Once the mission is arranged (or impossible), finish with {"final":"..."} saying what happened.
`.trim()

/**
 * Render teammate's last STATUS_REPORT into a compact prompt line.
 * @param {import('../types.js').StatusReport | null} status
 * @returns {string}
 */
export function formatPeerStatus(status) {
  if (!status) return "teammate (Agent A): no status report received yet"
  const teammateName = status.name ?? status.agentId ?? "Agent A"
  const carrying = Array.isArray(status.carrying) ? status.carrying.length : 0
  const intention = status.intention ? JSON.stringify(status.intention) : "none"
  const paused = status.paused ? " (PAUSED)" : ""
  return `teammate ${teammateName} at (${status.x},${status.y}) carrying ${carrying}, current intention ${intention}${paused}`
}

/**
 * Render tool catalog as one line per tool.
 * @param {import('../types.js').Tool[]} tools
 * @returns {string}
 */
export function formatToolCatalog(tools) {
  return tools
    .map((tool) => `- ${tool.name} args=${tool.args} — ${tool.description}`)
    .join("\n")
}

/**
 * @typedef {{ call?: string, observation?: string, note?: string }} LoopHistoryEntry
 */

/**
 * Assemble full prompt for one tool-loop turn: system rules, mission, catalog, live observation, transcript.
 * @param {{
 *   mission: string,
 *   from?: string,
 *   catalog: string,
 *   observation: string,
 *   history?: LoopHistoryEntry[]
 * }} options
 * @returns {string}
 */
export function buildMissionPrompt({
  mission,
  from,
  catalog,
  observation,
  history = [],
}) {
  const lines = [
    COORDINATOR_SYSTEM_PROMPT,
    "",
    `Mission${from ? ` from ${from}` : ""}: ${mission}`,
    "",
    "Tools:",
    catalog,
    "",
    "For assign_to_teammate, args is ONE of these command objects:",
    COMMAND_SCHEMA,
    "",
    "Current observation (your live world state):",
    observation,
  ]

  if (history.length > 0) {
    const trimmed = history.slice(-4)
    lines.push("", "Steps so far:")
    trimmed.forEach((entry, index) => {
      if (entry.note) {
        lines.push(`${index + 1}. ${entry.note}`)
        return
      }
      lines.push(
        `${index + 1}. you called ${entry.call}`,
        `   result: ${entry.observation}`
      )
    })
  }

  lines.push(
    "",
    "Reply with exactly one JSON object (a tool call, or a final)."
  )
  return lines.join("\n")
}
