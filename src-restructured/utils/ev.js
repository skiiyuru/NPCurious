/**
 * utils/ev.js
 * Expected Value (EV) computation for pickup options.
 *
 * EV = P(available) × rewardOnArrival − deliveryDecayCost
 *
 * Phase 3 will refine P(available) using confidence scores from BeliefBase.
 * For now P(available) = 1 for all sensed parcels (binary belief model).
 */

/**
 * Compute the expected value of picking up `option` given current beliefs.
 *
 * @param {{
 *   parcel: { id: string, reward: number, baseReward: number, lastSeen: number },
 *   pickupSteps: number,
 *   deliverySteps: number,
 * }} option
 * @param {{
 *   decayIntervalMs: number,
 *   movementDurationMs: number,
 *   estimateRewardOnArrival: (parcel: any, steps: number) => number
 * }} beliefs
 * @returns {number}
 */
export function computeEV(option, beliefs) {
  const { parcel, pickupSteps, deliverySteps } = option

  // P(available) — binary for now; Phase 3 will use confidence ∈ [0, 1]
  const pAvailable = 1

  const rewardOnArrival = beliefs.estimateRewardOnArrival(parcel, pickupSteps)

  // Decay cost incurred during the delivery walk after pickup
  const decayPerStep =
    beliefs.decayIntervalMs === Infinity
      ? 0
      : beliefs.movementDurationMs / beliefs.decayIntervalMs

  const deliveryDecayCost = deliverySteps * decayPerStep

  return pAvailable * rewardOnArrival - deliveryDecayCost
}

/**
 * Compute an opportunistic EV bonus for parcels within `maxSteps`.
 * Closer parcels within the threshold receive a flat bonus per saved step.
 *
 * @param {number} baseEV
 * @param {number} pickupSteps
 * @param {number} maxSteps
 * @param {number} bonusPerSavedStep
 * @returns {number}
 */
export function computeOpportunisticEV(
  baseEV,
  pickupSteps,
  maxSteps,
  bonusPerSavedStep = 8
) {
  if (pickupSteps > maxSteps) return baseEV
  return baseEV + (maxSteps - pickupSteps) * bonusPerSavedStep
}
