/**
 * This is the master blueprint for all plans. You never run "PlanBase" 
 * directly. Instead, specific plans (like GoPickUp) "extend" this base. 
 * It ensures every plan in the agent's brain shares the exact same 
 * foundational structure and helper tools.
 * * CORE RESPONSIBILITIES:
 * * 1. THE PLACEHOLDERS (isApplicable & execute)
 * - Defines blank sections that every specific manual MUST fill out.
 * * 2. THE EMERGENCY STOP (stop)
 * - Provides a standard "Halt" button so the agent can cancel a plan 
 * mid-execution if the world suddenly changes.
 * * 3. LOGGING (log)
 * - A standard way to write messages to the developer console so every 
 * message automatically includes the name of the plan that printed it.
 * * 4. FUTURE EXPANSION (subIntention)
 * - A placeholder for Phase 4, where complex plans will be able to spawn 
 * "mini-tasks" (e.g., "To deliver this, I first need to find a key").
 * ============================================================================
 */

export class PlanBase {
  /**
   * @param {import("../beliefs/BeliefBase.js").BeliefBase} beliefBase
   * @param {import("../beliefs/queries.js").BeliefQueries} queries
   */
  constructor(beliefBase, queries) {
    this.beliefBase = beliefBase
    this.queries = queries
    this._stopped = false
  }

  static get name() {
    return "PlanBase"
  }

  /**
   * @param {import("../intentions/Intention.js").Intention} intention
   * @returns {boolean}
   */
  isApplicable(intention) {
    return false
  }

  /**
   * @param {import("../intentions/Intention.js").Intention} intention
   * @returns {{ action: string, dir?: string }[]}
   */
  execute(intention) {
    return []
  }

  // Signal to stop execute plan
  stop() {
    this._stopped = true
  }

  // flag to return true if stop
  get stopped() {
    return this._stopped
  }

  /**
   * [Phase 4] preparation
   * @param {string} predicate
   * @param {any} target
   */
  subIntention(predicate, target) {
    this.log(`subIntention(${predicate}) — not yet wired (Phase 4)`)
    return { predicate, target }
  }

  /**
   * @param {string} msg
   */
  log(msg) { // log
    console.log(`[${this.constructor.name}] ${msg}`)
  }
}
