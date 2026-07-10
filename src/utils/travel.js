/**
 * @fileoverview Travel-cost estimator for EV scoring. Real step count via local A* over belief map.
 * Decision-only — actual movement still uses the PDDL planner.
 * @module utils/travel
 */

import { astar } from "./pathfinding.js"
import { manhattan } from "./distance.js"

/**
 * Steps from `from` to `to` over the static belief map (walls block, one-way tiles respected,
 * transient blocks ignored). Falls back to Manhattan when map dimensions unknown.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Position|null|undefined} from
 * @param {import('../types.js').Position|null|undefined} to
 * @returns {number} Step count, `0` if already there, `Infinity` if unreachable.
 */
export function travelCost(beliefs, from, to) {
  if (!from || !to) return Infinity
  const width = beliefs.map?.width ?? 0
  const height = beliefs.map?.height ?? 0
  if (width <= 0 || height <= 0) return manhattan(from, to)

  // Static-map walkability only — ignores transient blocks for stable target ranking.
  const isInBoundsAndOpen = (
    /** @type {number} */ x,
    /** @type {number} */ y
  ) => {
    const inBounds = x >= 0 && y >= 0 && x < width && y < height
    if (!inBounds) return false
    return !beliefs.isObstacleAt(x, y)
  }

  const canEnter = (
    /** @type {number} */ fx,
    /** @type {number} */ fy,
    /** @type {number} */ tx,
    /** @type {number} */ ty
  ) => beliefs.canEnterFrom(fx, fy, tx, ty)

  const path = astar(from, to, isInBoundsAndOpen, canEnter)
  return path ? path.length : Infinity
}

/**
 * Memoized `travelCost` bound to one belief snapshot. Identical legs computed once per pass.
 * @param {import('../types.js').Beliefs} beliefs
 * @returns {(from: import('../types.js').Position|null|undefined, to: import('../types.js').Position|null|undefined) => number}
 */
export function memoizedTravelCost(beliefs) {
  /** @type {Map<string, number>} */
  const cache = new Map()
  return (from, to) => {
    const cacheKey = `${from?.x},${from?.y}->${to?.x},${to?.y}`
    let value = cache.get(cacheKey)
    if (value === undefined) {
      value = travelCost(beliefs, from, to)
      cache.set(cacheKey, value)
    }
    return value
  }
}
