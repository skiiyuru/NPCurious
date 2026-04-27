/**
 * This file handles the math related to time and memory. In this game, 
 * packages lose their reward value the longer they sit on the ground. 
 * This file acts as a calculator to figure out exactly what a package 
 * is worth at any given moment.
 * * CORE RESPONSIBILITIES:
 * * 1. REWARD ESTIMATION (The "Time is Money" Calculator)
 * - estimateReward: Calculates a package's exact current value based on 
 * how much time has passed since the agent last looked at it.
 * - estimateRewardOnArrival: Looks into the future. It calculates how 
 * much a package *will* be worth by the time the agent finishes walking to it.
 * * 2. BELIEF REVISION (Future "Doubt" Engine - Phase 3)
 * - bayesianUpdate / decayConfidence: Advanced math formulas. In the future, 
 * the agent won't just assume its memory is 100% correct. These formulas 
 * will help the agent say, "I haven't been to that corner of the map in 
 * 5 minutes, so I am only 40% confident that package is still there."
 * ============================================================================
 */

/**
 *
 * @param {{ reward?: number, baseReward?: number, lastSeen: number }} parcel
 * @param {number} decayIntervalMs   Infinity = no decay
 * @returns {number}
 */
// This function estimate the reward of parcels 
export function estimateReward(parcel, decayIntervalMs) {
  if (decayIntervalMs === Infinity) {
    return parcel.reward ?? parcel.baseReward ?? 0
  }
  const baseReward = parcel.baseReward ?? parcel.reward ?? 0 //Grabs the starting value of the package
  const elapsed = Date.now() - parcel.lastSeen // Subtracts the time the package was last seen from the current time (Date.now())
  const decayed = Math.floor(elapsed / decayIntervalMs) // How many "ticks" of value the package has lost
  return Math.max(0, baseReward - decayed)
}

/**
 * @param {{ reward?: number, baseReward?: number, lastSeen: number }} parcel
 * @param {number} stepsAway
 * @param {number} movementDurationMs
 * @param {number} decayIntervalMs
 * @returns {number}
 */
// Esimating reward when agents arrive
export function estimateRewardOnArrival(
  parcel,
  stepsAway,
  movementDurationMs,
  decayIntervalMs
) {
  const baseReward = parcel.baseReward ?? parcel.reward ?? 0
  if (decayIntervalMs === Infinity) return baseReward

  const travelMs = stepsAway * movementDurationMs //number of steps it takes to get there
  const totalMs = Date.now() - parcel.lastSeen + travelMs // travel time to the time that has already passed
  const decayed = Math.floor(totalMs / decayIntervalMs) // Same math logic
  return Math.max(0, baseReward - decayed)
}


/**
 * P(H|E) = P(E|H) × P(H) / P(E)
 * @param {number} priorConfidence   P(H)       — current belief confidence ∈ [0,1]
 * @param {number} likelihood        P(E|H)     — how likely this evidence if H is true
 * @param {number} marginal          P(E)       — overall probability of this evidence
 * @returns {number}  posterior confidence ∈ [0,1]
 */
export function bayesianUpdate(priorConfidence, likelihood, marginal) {
  if (marginal === 0) return priorConfidence // Safety check divided by zero
  return Math.min(1, Math.max(0, (likelihood * priorConfidence) / marginal))
}

/**
 * D(d) = e^(−λ·d)
 *
 * @param {number} currentConfidence
 * @param {number} lambda            decay rate (0 = no decay, higher = faster)
 * @param {number} d                 distance or time delta
 * @returns {number}
 */
// Memory decay for the agent
export function decayConfidence(currentConfidence, lambda, d) {
  return currentConfidence * Math.exp(-lambda * d)
}
