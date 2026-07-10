/** @fileoverview Option filter: scores candidates with EV, returns highest. */

import { computeEV } from "../utils/ev.js"
import { memoizedTravelCost } from "../utils/travel.js"

/**
 * Highest-EV option from the generated desires, or null when none scorable.
 * @param {import('../types.js').Option[]} options
 * @param {import('../types.js').Beliefs} beliefs
 * @returns {{ option: import('../types.js').Option, estimatedEV: number }|null}
 */
export function selectBestOption(options, beliefs) {
  if (!options.length || !beliefs.me) return null

  // One memoized cost function per pass — shared "me → zone" leg computed once.
  const cost = memoizedTravelCost(beliefs)

  const scored = options.map(
    (/** @type {import('../types.js').Option} */ option) => ({
      option,
      estimatedEV: computeEV(option, beliefs, cost),
    })
  )

  // Linear scan: only need the single best; strict > keeps first of equal scores (stable tie-break).
  let best = scored[0]
  for (const candidate of scored) {
    if (candidate.estimatedEV > best.estimatedEV) best = candidate
  }
  return best
}
