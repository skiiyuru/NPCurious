/** @fileoverview Error-formatting helpers. */

/**
 * Unknown thrown value to message string.
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
