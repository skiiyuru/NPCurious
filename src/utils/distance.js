/** @fileoverview Pure grid-distance helpers. */

/**
 * Manhattan distance between two grid positions.
 * @param {import('../types.js').Position|null|undefined} a
 * @param {import('../types.js').Position|null|undefined} b
 * @returns {number} Sum of absolute tile distances, or `Infinity` when either position is missing.
 */
export function manhattan(a, b) {
  if (!a || !b) return Infinity
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/**
 * True when two positions occupy the same grid cell.
 * @param {import('../types.js').Position|null|undefined} a
 * @param {import('../types.js').Position|null|undefined} b
 * @returns {boolean}
 */
export function samePosition(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y)
}
