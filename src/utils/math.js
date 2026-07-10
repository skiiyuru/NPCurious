/** @fileoverview Numeric helpers for belief scoring, trust, and capacity. */

/**
 * Clamp `value` to `[min, max]`. Value is the MIDDLE argument.
 * @param {number} min
 * @param {number} value
 * @param {number} max
 * @returns {number}
 */
export function clamp(min, value, max) {
  return Math.max(min, Math.min(value, max))
}
