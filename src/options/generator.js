/** @fileoverview Option generator: converts belief state into candidate desires each deliberation cycle. */

import { manhattan } from "../utils/distance.js"

/**
 * Pickup options for high-confidence free parcels, delivery option when carrying,
 * and explore fallback when idle.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Config} config
 * @returns {import('../types.js').Option[]}
 */
export function generateOptions(beliefs, config) {
  const options = /** @type {import('../types.js').Option[]} */ ([])
  const carried = beliefs.getCarriedParcels()
  const freeParcels = beliefs.getFreeParcels()
  const capacity = beliefs.strategy.carryCapacity
  const sensingRange =
    beliefs.strategy?.sensingRange ?? config.sensingRange ?? 5

  // Full: delivery is the only sensible option.
  if (carried.length >= capacity) {
    const deliver = makeDeliverOption(beliefs, carried, "capacity-full")
    return deliver ? [deliver] : []
  }

  for (const parcel of freeParcels) {
    if (isWorthPickingUp(parcel, beliefs, config, sensingRange)) {
      options.push(makePickupOption(parcel))
    }
  }

  // Delivery competes with pickups when carrying; EV filter decides whether to batch or deliver.
  const locked = beliefs.strategy?.lockedCapacity
  if (carried.length > 0 && !locked) {
    const deliver = makeDeliverOption(beliefs, carried, "deliver-batch")
    if (deliver) options.push(deliver)
  }

  if (options.length === 0) {
    options.push({ type: "explore", estimatedEV: 0, reason: "idle" })
  }

  return options
}

/**
 * True when the parcel is within sight, confident, valuable, reachable, unclaimed, and under reward cap.
 * @param {import('../types.js').Parcel} parcel
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Config} config
 * @param {number} sensingRange
 * @returns {boolean}
 */
function isWorthPickingUp(parcel, beliefs, config, sensingRange) {
  const parcelPosition = /** @type {import('../types.js').Position} */ (parcel)
  if (manhattan(beliefs.me, parcelPosition) > sensingRange) return false
  if ((parcel.confidence ?? 1) < config.minParcelConfidence) return false
  if ((parcel.reward ?? 0) <= 0) return false
  if (beliefs.isTransientlyBlocked(parcel.x ?? -1, parcel.y ?? -1)) return false
  if (beliefs.isParcelClaimedByPeer?.(parcel.id ?? "", config.peerClaimTtlMs))
    return false
  const maxReward = beliefs.strategy?.constraints?.maxParcelReward
  if (typeof maxReward === "number" && (parcel.reward ?? 0) > maxReward)
    return false
  return true
}

/**
 * Pickup option for a single free parcel.
 * @param {import('../types.js').Parcel} parcel
 * @returns {import('../types.js').Option}
 */
function makePickupOption(parcel) {
  return {
    type: "pickup",
    parcelId: parcel.id,
    target: { x: Math.round(parcel.x ?? 0), y: Math.round(parcel.y ?? 0) },
    reward: parcel.reward ?? 0,
    parcel,
    reason: "free-parcel",
  }
}

/**
 * Delivery option for the currently carried batch. Null when no zone known or no valuable parcels.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Parcel[]} carried
 * @param {string} reason
 * @returns {import('../types.js').Option|null}
 */
function makeDeliverOption(beliefs, carried, reason) {
  const valuable = carried.filter((parcel) => (parcel.reward ?? 0) > 0)
  const target = beliefs.getNearestDeliveryZone()
  if (!target || valuable.length === 0) return null

  let totalReward = 0
  for (const parcel of valuable) totalReward += parcel.reward ?? 0

  return /** @type {import('../types.js').Option} */ ({
    type: "deliver",
    parcelIds: valuable.map((parcel) => parcel.id ?? ""),
    target,
    reward: totalReward,
    parcels: valuable,
    reason,
  })
}
