/**
 * This file manages the full lifecycle of a task. It acts as the middleman 
 * between the agent's brain (which generates ideas) and the execution 
 * loop (which physically moves the agent's legs).
 * * CORE RESPONSIBILITIES:
 * * 1. CREATING WORK ORDERS (push)
 * - Takes raw options (ideas) from the filtering system, wraps them into 
 * official `Intention` Work Orders, and hands them to the chosen Strategy.
 * * 2. TRACKING PROGRESS (setPlanLength / onStepCompleted)
 * - Tracks exactly how many steps a task requires and updates the 
 * completion percentage every time the agent takes a step.
 * * 3. CLOSING OUT TASKS (onIntentionSucceeded / onIntentionFailed)
 * - Removes the task from the board and stamps it as success or failure.
 * * 4. REALITY CHECKS (pruneInvalid)
 * - Constantly checks the Librarian (BeliefQueries) to make sure the 
 * target package still exists. If the package was stolen, it cancels 
 * the task to prevent the agent from freezing or walking in endless loops.
 * ============================================================================
 */

import { Intention } from "./Intention.js"

export class IntentionQueue {
  /**
   * @param {import("./strategies/Queue.js").QueueStrategy
   *        | import("./strategies/Replace.js").ReplaceStrategy
   *        | import("./strategies/Revise.js").ReviseStrategy} strategy
   * @param {import("../beliefs/queries.js").BeliefQueries} queries
   */
  //  Strat: List of task that need to done fifo queue, etc
  // Query: check if the plan still exist
  constructor(strategy, queries) {
    this._strategy = strategy
    this._queries = queries
    this._totalPlanSteps = 0 //counter
    this._completedSteps = 0 //counter
  }

  /** @returns {Intention | null} */
  // Return top current list from strategy
  get current() {
    return this._strategy.current
  }

  /**
   * @param {{ type: string, parcel?: any, target?: any, ev?: number }} option
   */
  // Push raw unformated option
  push(option) {
    const target = option.parcel ?? option.target ?? null // what is the target, tile, package, dropzone, etc
    const intention = new Intention(option.type, target, option.ev ?? 0) // Create intention based on target
    this._strategy.push(intention) // new intetnion
  }

  /**
   * @param {number} totalSteps
   */
  setPlanLength(totalSteps) { // Progress of the agents that calculates the route (how many steps)
    this._totalPlanSteps = totalSteps
    this._completedSteps = 0
    if (this.current) this.current.setProgress(0)
  }
  //  If complete then done and updating work progress bar
  onStepCompleted() {
    this._completedSteps++
    if (this.current && this._totalPlanSteps > 0) {
      this.current.setProgress(this._completedSteps / this._totalPlanSteps)
    }
  }

  // Mark current intention as done or fail
  onIntentionSucceeded() {
    const done = this._strategy.shift()
    if (done) done.succeed()
  }
  onIntentionFailed() {
    const failed = this._strategy.shift()
    if (failed) failed.fail()
  }

  // Remove intention that are failed e.g. package stolen.
  pruneInvalid() {
    this._strategy.remove((intention) => {
      if (!intention.isAlive) return true

      if (intention.predicate === "PICKUP") {
        const parcel = intention.target
        if (!parcel?.id) return true
        const freeParcels = this._queries.getFreeParcels()
        return !freeParcels.some((p) => p.id === parcel.id)
      }

      return false
    })
  }

  // drop all intention
  clear() {
    this._strategy.clear()
  }

  get size() {
    return this._strategy.size
  }
}
