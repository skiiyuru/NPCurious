/** @fileoverview Simple logger wrapper that can silence console.log. */

/**
 * A logger interface that can be used by any component.
 * @typedef {Object} Logger
 * @property {(...args: any[]) => void} log
 * @property {(...args: any[]) => void} warn
 * @property {(...args: any[]) => void} error
 */

/** @type {Logger} */
export const quietLogger = {
  log: () => {},
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
}
