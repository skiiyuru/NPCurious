/**
 * Error thrown by plans to signal failure mode to the BDI loop.
 * `recoverable` true = try replanning; false = drop intention.
 */
export class PlanFailure extends Error {
  /**
   * @param {string} message
   * @param {boolean} [recoverable]
   */
  constructor(message, recoverable = true) {
    super(message)
    this.name = "PlanFailure"
    this.recoverable = recoverable
    /** @type {boolean | undefined} */
    this.reconsidered = undefined
  }
}

/**
 * Execution context passed to every plan's `execute`.
 * @typedef {Object} PlanContext
 * @property {import('../types.js').Beliefs} beliefs
 * @property {{ move: Function, pickup: Function, putdown: Function }} actions
 * @property {import('../types.js').Config} config
 * @property {import('../planning/pddl/ExternalPlanner.js').ExternalPlanner} [planner]
 * @property {() => boolean} [reconsider]
 */

/**
 * Base class for all plans. Provides cooperative cancellation via `stopped` / `checkStopped`.
 */
export class PlanBase {
  /**
   * @param {string} name - Used in failure messages and logs.
   */
  constructor(name) {
    this.name = name
    this.stopped = false
  }

  /** Signal plan to stop at its next safety check. */
  stop() {
    this.stopped = true
  }

  /** Throw recoverable PlanFailure if stopped — call at start of each action loop iteration. */
  checkStopped() {
    if (this.stopped) throw new PlanFailure(`${this.name} stopped`, true)
  }

  /**
   * True when this plan can execute the given intention. Base default handles nothing.
   * @param {import('../intentions/Intention.js').Intention} intention
   * @returns {boolean}
   */
  isApplicable(intention) {
    return false
  }

  /**
   * Carry out the plan. Base default always fails — subclasses override.
   * @param {import('../intentions/Intention.js').Intention} intention
   * @param {PlanContext} context
   * @returns {Promise<void>}
   */
  async execute(intention, context) {
    throw new PlanFailure(`${this.name} has no execute()`, false)
  }
}
