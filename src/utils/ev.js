/** @fileoverview Expected-value (EV) scoring for each option type. Pure functions over belief state. */

import { manhattan } from "./distance.js"
import { availability } from "./belief.js"

/**
 * Default cost metric: Manhattan distance. Inject a real path-cost fn for wall/one-way accuracy.
 * @param {import('../types.js').Position|null|undefined} from
 * @param {import('../types.js').Position|null|undefined} to
 * @returns {number}
 */
const manhattanCost = (from, to) => manhattan(from, to)

/** @typedef {(from: import('../types.js').Position|null|undefined, to: import('../types.js').Position|null|undefined) => number} CostFn */

/**
 * Nominal reward minus travel-time decay.
 * @param {number} reward
 * @param {number} steps
 * @param {import('../types.js').Beliefs} beliefs
 * @returns {number} Net reward floored at 0.
 */
export function decayedReward(reward, steps, beliefs) {
  const decayPerStep = beliefs.strategy?.rewardDecayPerStep ?? 0
  return Math.max(0, reward - decayPerStep * Math.max(0, steps))
}

/**
 * Score a pickup option: P(available)×reward − travel cost.
 * @param {import('../types.js').Option} option
 * @param {import('../types.js').Beliefs} beliefs
 * @param {CostFn} [cost=manhattanCost]
 * @returns {number} EV scalar; higher is better.
 */
export function pickupEV(option, beliefs, cost = manhattanCost) {
  const pickupDistance = cost(beliefs.me, option.target)
  const deliveryZone = beliefs.getNearestDeliveryZone(option.target, cost)
  const deliveryDistance = deliveryZone ? cost(option.target, deliveryZone) : 0
  if (!Number.isFinite(pickupDistance) || !Number.isFinite(deliveryDistance))
    return -Infinity

  const pAvailable = availability(/** @type {any} */ (option).parcel, beliefs)
  const stepsToBank = pickupDistance + deliveryDistance
  const reward = decayedReward(option.reward ?? 0, stepsToBank, beliefs)

  // When already carrying, only charge the detour over a direct delivery trip.
  const carrying = beliefs.getCarriedParcels().length > 0
  const travelCost =
    carrying && deliveryZone
      ? Math.max(0, stepsToBank - cost(beliefs.me, deliveryZone))
      : stepsToBank

  return pAvailable * reward - travelCost
}

/**
 * Score a delivery option: carried reward − distance + capacity-pressure bonus.
 * @param {import('../types.js').Option} option
 * @param {import('../types.js').Beliefs} beliefs
 * @param {CostFn} [cost=manhattanCost]
 * @returns {number} EV scalar; higher is better.
 */
export function deliverEV(option, beliefs, cost = manhattanCost) {
  const distance = cost(beliefs.me, option.target)
  if (!Number.isFinite(distance)) return -Infinity
  const carriedCount = (option.parcelIds ?? []).length
  const capacity = Math.max(1, beliefs.strategy.carryCapacity)
  const reward = decayedReward(option.reward ?? 0, distance, beliefs)
  const maxReward = beliefs.strategy?.constraints?.maxParcelReward
  if (typeof maxReward === "number" && reward > maxReward) return -Infinity
  const capacityPressureBonus = (carriedCount / capacity) * reward * 0.5

  return reward - distance + capacityPressureBonus
}

/**
 * Dispatch EV to the appropriate scorer by option type.
 * @param {import('../types.js').Option} option
 * @param {import('../types.js').Beliefs} beliefs
 * @param {CostFn} [cost=manhattanCost]
 * @returns {number} Comparable EV scalar; `-Infinity` when unscoreable.
 */
export function computeEV(option, beliefs, cost = manhattanCost) {
  if (!option || !beliefs.me) return -Infinity
  if (option.type === "pickup") return pickupEV(option, beliefs, cost)
  if (option.type === "deliver") return deliverEV(option, beliefs, cost)
  if (option.type === "explore") return option.estimatedEV ?? 0
  return -Infinity
}
