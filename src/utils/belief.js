/** @fileoverview Bayesian belief helpers: distance decay, not-seen update, steal-risk, availability. */

import { manhattan } from "./distance.js"
import { clamp } from "./math.js"

/**
 * Spatial decay D(d) = e^(−λd).
 * @param {number} distance
 * @param {number} lambda
 * @returns {number} Confidence in [0, 1].
 */
export function distanceDecay(distance, lambda) {
  if (!Number.isFinite(distance) || distance < 0) return 0
  if (!Number.isFinite(lambda) || lambda <= 0) return 1
  return Math.exp(-lambda * distance)
}

/**
 * Bayesian revision after NO sighting: P(H|¬Seen).
 * @param {number} prior
 * @param {number} sensorMissProbability
 * @param {number} [notThereProbability=1]
 * @returns {number} Posterior in [0, 1].
 */
export function bayesNotSeen(
  prior,
  sensorMissProbability,
  notThereProbability = 1
) {
  const clampedPrior = clamp(0, prior, 1)
  const numerator = sensorMissProbability * clampedPrior
  const denominator = numerator + notThereProbability * (1 - clampedPrior)
  if (denominator <= 0) return 0 // degenerate case
  return numerator / denominator
}

/**
 * Probability competitor reaches `target` first, as [0, weight] penalty.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Position} target
 * @param {{ weight?: number, lambda?: number }} [opts={}]
 * @returns {number} Steal-risk in [0, weight].
 */
export function stealRisk(beliefs, target, { weight, lambda } = {}) {
  const riskWeight = weight ?? beliefs.strategy?.agentStealRiskWeight ?? 0
  const lambdaDistance = lambda ?? beliefs.strategy?.lambdaDistanceDecay ?? 0
  if (riskWeight <= 0 || !beliefs.me || !target) return 0

  const theirDistance = beliefs.getNearestAgentDistanceTo(target)
  if (!Number.isFinite(theirDistance)) return 0

  const ourDistance = manhattan(beliefs.me, target)
  if (theirDistance > ourDistance) return 0

  const rawRisk = riskWeight * distanceDecay(theirDistance, lambdaDistance)
  return Math.min(0.99, rawRisk)
}

/**
 * P(parcel exists AND not stolen) for EV scoring.
 * @param {import('../types.js').Parcel} parcel
 * @param {import('../types.js').Beliefs} beliefs
 * @param {{ weight?: number, lambda?: number }} [opts={}]
 * @returns {number} Availability in [0, 1].
 */
export function availability(parcel, beliefs, opts = {}) {
  const confidence = parcel?.confidence ?? 1
  const target = { x: parcel?.x ?? 0, y: parcel?.y ?? 0 }
  const risk = stealRisk(beliefs, target, opts)
  return confidence * (1 - risk)
}
