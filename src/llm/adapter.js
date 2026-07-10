const COMMAND_TYPES = [
  "set_policy",
  "add_intention",
  "constraint",
  "explain",
  "move",
]

/**
 * @typedef {Object} CommandResult
 * @property {boolean} applied
 * @property {string} reason
 * @property {string} [text]
 */

/**
 * Extract a JSON object from LLM response text (strips markdown fences, slices first `{` to last `}`).
 * @param {string} text
 * @returns {string}
 */
export function extractJsonObject(text) {
  if (typeof text !== "string") throw new Error("LLM response must be text")
  const withoutFences = text.replace(/```(?:json)?/gi, "").trim()
  const start = withoutFences.indexOf("{")
  const end = withoutFences.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start)
    throw new Error("No JSON object found in LLM response")
  return withoutFences.slice(start, end + 1)
}

/**
 * Structural validation for a parsed command object. Throws on malformed input.
 * @param {import('../types.js').Command} command
 * @returns {import('../types.js').Command}
 */
export function validateCommand(command) {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    throw new Error("LLM command must be an object")
  }
  if (!COMMAND_TYPES.includes(command.type)) {
    throw new Error(`Unsupported command type: ${command.type}`)
  }
  if (command.type === "add_intention") {
    const intention = command.intention
    if (!intention || !["pickup", "deliver"].includes(intention.type)) {
      throw new Error(
        "add_intention requires an intention of type pickup or deliver"
      )
    }
  }
  if (
    command.type === "set_policy" &&
    (!command.policy || typeof command.policy !== "object")
  ) {
    throw new Error("set_policy requires a policy object")
  }
  if (
    command.type === "constraint" &&
    (!command.constraint || typeof command.constraint !== "object")
  ) {
    throw new Error("constraint requires a constraint object")
  }
  if (command.type === "move") {
    const target = command.target
    if (
      !target ||
      typeof target.x !== "number" ||
      typeof target.y !== "number"
    ) {
      throw new Error("move requires a target with numeric x and y")
    }
  }
  return command
}

/**
 * Verify pickup intention against beliefs; enrich with parcel position and reward.
 * @param {import('../types.js').Option} intention
 * @param {import('../types.js').Beliefs} beliefs
 * @returns {import('../types.js').Option}
 */
function requireKnownPickup(intention, beliefs) {
  const parcelId = /** @type {string} */ (intention.parcelId)
  const parcel = beliefs.parcels.get(parcelId)
  if (!parcel) throw new Error(`Unknown parcel: ${parcelId}`)
  if (parcel.carriedBy && parcel.carriedBy !== beliefs.me?.id) {
    throw new Error(`Parcel is not available: ${parcelId}`)
  }
  return {
    ...intention,
    target: intention.target ?? {
      x: Math.round(parcel.x ?? 0),
      y: Math.round(parcel.y ?? 0),
    },
    reward: parcel.reward,
  }
}

/**
 * Verify deliver intention against beliefs; resolve parcelIds, target, and reward.
 * @param {import('../types.js').Option} intention
 * @param {import('../types.js').Beliefs} beliefs
 * @returns {import('../types.js').Option}
 */
function requireDeliverable(intention, beliefs) {
  const carried = /** @type {import('../types.js').Parcel[]} */ (
    beliefs.getCarriedParcels()
  )
  if (carried.length === 0) throw new Error("No carried parcels to deliver")

  const carriedIds = carried.map((parcel) => parcel.id ?? "")
  const requestedIds = intention.parcelIds
  const parcelIds = /** @type {string[]} */ (
    requestedIds && requestedIds.length > 0 ? requestedIds : carriedIds
  )

  const carriedById = new Map(carried.map((parcel) => [parcel.id, parcel]))
  const parcels = parcelIds.map((id) => {
    const parcel = carriedById.get(id)
    if (!parcel) throw new Error(`Parcel is not carried by this agent: ${id}`)
    return parcel
  })

  const target = intention.target ?? beliefs.getNearestDeliveryZone()
  if (!target) throw new Error("No delivery zone is known")

  let totalReward = 0
  for (const parcel of parcels) totalReward += parcel.reward ?? 0

  return { ...intention, parcelIds, target, reward: totalReward }
}

/**
 * Route intention to the correct belief-validation helper.
 * @param {import('../types.js').Option} intention
 * @param {import('../types.js').Beliefs} beliefs
 * @returns {import('../types.js').Option}
 */
function validateAgainstBeliefs(intention, beliefs) {
  if (intention.type === "pickup") return requireKnownPickup(intention, beliefs)
  if (intention.type === "deliver")
    return requireDeliverable(intention, beliefs)
  throw new Error(`Unsupported intention type: ${intention.type}`)
}

/**
 * Merge policy into strategy.
 * @param {import('../types.js').Command} command
 * @param {import('../types.js').Beliefs} beliefs
 * @returns {CommandResult}
 */
function applySetPolicy(command, beliefs) {
  beliefs.strategy = { ...beliefs.strategy, ...command.policy }
  return { applied: true, reason: "policy-updated" }
}

/**
 * Validate and queue a user-directed intention at max EV.
 * @param {import('../types.js').Command} command
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').IntentionQueue} intentions
 * @returns {CommandResult}
 */
function applyAddIntention(command, beliefs, intentions) {
  const proposedIntention = /** @type {import('../types.js').Option} */ (
    command.intention
  )
  const option = validateAgainstBeliefs(proposedIntention, beliefs)
  intentions.revise({ option, estimatedEV: Number.POSITIVE_INFINITY }, "user")
  return { applied: true, reason: "user-intention-added" }
}

/**
 * Merge constraint into strategy.constraints.
 * @param {import('../types.js').Command} command
 * @param {import('../types.js').Beliefs} beliefs
 * @returns {CommandResult}
 */
function applyConstraint(command, beliefs) {
  const strategy = /** @type {Object<string, *>} */ (beliefs.strategy)
  const prevConstraints = /** @type {Object<string, *>} */ (
    strategy.constraints ?? {}
  )
  beliefs.strategy = /** @type {typeof beliefs.strategy} */ ({
    ...strategy,
    constraints: { ...prevConstraints, ...command.constraint },
  })
  return { applied: true, reason: "constraint-stored" }
}

/**
 * Queue a user-directed move at max EV; rejects walls or off-map targets.
 * @param {import('../types.js').Command} command
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').IntentionQueue} intentions
 * @returns {CommandResult}
 */
function applyMove(command, beliefs, intentions) {
  const target = /** @type {import('../types.js').Position} */ (command.target)
  const mapKnown = (beliefs.map?.width ?? 0) > 0
  if (mapKnown && !beliefs.isKnownWalkable(target.x, target.y)) {
    return {
      applied: false,
      reason: "unreachable-target",
      text: `Cannot move to (${target.x},${target.y}): it is a wall or not a tile on the map.`,
    }
  }
  intentions.revise(
    {
      option: /** @type {import('../types.js').Option} */ ({
        type: "move",
        target,
        reason: "user-move",
      }),
      estimatedEV: Number.POSITIVE_INFINITY,
    },
    "user"
  )
  return { applied: true, reason: "move-intention-added" }
}

/**
 * Return explanation text without changing state.
 * @param {import('../types.js').Command} command
 * @returns {CommandResult}
 */
function applyExplain(command) {
  const commandWithLegacyFields = /** @type {Object<string, *>} */ (command)
  const text =
    command.text ?? String(commandWithLegacyFields["explanation"] ?? "")
  return { applied: true, reason: "explanation", text }
}

/**
 * Dispatch validated command to handler; returns CommandResult.
 * @param {import('../types.js').Command} command
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').IntentionQueue} intentions
 * @returns {CommandResult}
 */
export function applyUserCommand(command, beliefs, intentions) {
  if (command.type === "set_policy") return applySetPolicy(command, beliefs)
  if (command.type === "add_intention")
    return applyAddIntention(command, beliefs, intentions)
  if (command.type === "constraint") return applyConstraint(command, beliefs)
  if (command.type === "move") return applyMove(command, beliefs, intentions)
  if (command.type === "explain") return applyExplain(command)
  return { applied: false, reason: "command-not-executable" }
}
