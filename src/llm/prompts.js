// Human- and model-readable description of allowed command shapes.
export const COMMAND_SCHEMA = `
Allowed commands (choose one):
- {"type":"move","target":{"x":10,"y":5}}
- {"type":"add_intention","intention":{"type":"pickup","parcelId":"p3","target":{"x":4,"y":2}}}
- {"type":"add_intention","intention":{"type":"deliver","parcelIds":["p1"],"target":{"x":0,"y":0}}}
- {"type":"set_policy","policy":{"carryCapacity":5,"agentStealRiskWeight":0.2}}
- {"type":"constraint","constraint":{"avoidTiles":[{"x":3,"y":3}]}}
- {"type":"explain","text":"<answer to a question, or one sentence describing current behavior>"}
`.trim()

/**
 * Compact world-state snapshot for grounding LLM commands.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').IntentionQueue} [intentions]
 * @returns {string}
 */
export function summarizeState(beliefs, intentions) {
  if (!beliefs) return "(no beliefs yet)"

  const me = beliefs.me
    ? `me: (${Math.round(beliefs.me.x)},${Math.round(beliefs.me.y)}) score=${beliefs.me.score ?? 0}`
    : "me: (unknown)"
  const carrying = beliefs.getCarriedParcels?.() ?? []

  const formatFreeParcel = (/** @type {import('../types.js').Parcel} */ p) => {
    const position = `(${Math.round(p.x)},${Math.round(p.y)})`
    return `${p.id}@${position} r=${p.reward ?? "?"} c=${(p.confidence ?? 1).toFixed(2)}`
  }

  const free = (beliefs.getFreeParcels?.() ?? [])
    .slice(0, 10)
    .map(formatFreeParcel)
    .join(", ")

  const zones = (beliefs.deliveryZones ?? [])
    .slice(0, 6)
    .map((/** @type {import('../types.js').Tile} */ z) => `(${z.x},${z.y})`)
    .join(", ")

  const current = intentions?.current?.()
  const intentionLine = current
    ? `current intention: ${JSON.stringify(current.predicate)}`
    : "current intention: none"

  return [
    me,
    `carrying: ${carrying.length}`,
    `free parcels: ${free || "none"}`,
    `delivery zones: ${zones || "none"}`,
    intentionLine,
    `paused: ${Boolean(beliefs.strategy?.paused)}`,
  ].join("\n")
}
