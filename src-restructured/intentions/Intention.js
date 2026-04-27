/**
 * This file defines exactly what a "Task" (or Intention) looks like in the 
 * agent's brain. Instead of just passing around a simple string like "go pick 
 * up a box", the agent creates a highly detailed Work Order. 
 * * CORE PROPERTIES:
 * - What to do (predicate): E.g., "PICKUP", "DELIVER", or "EXPLORE".
 * - What it involves (target): The specific package, drop-off zone, or tile.
 * - How much it pays (estimatedEV): The Expected Value calculated when the 
 * task was first created (useful for the Smart Manager's whiteboard).
 * - How far along it is (progress): A percentage of how many steps are done.
 * - Current state (status): A stamp that says whether the task is waiting in 
 * line, currently being worked on, finished, failed, or thrown in the trash.
 * ============================================================================
 */

export class Intention {
  /**
   * @param {string} predicate
   * @param {any} target
   * @param {number} estimatedEV
   */
  constructor(predicate, target, estimatedEV = 0) {
    // Writing infromation that are being provided
    this.predicate = predicate
    this.target = target
    this.createdAt = Date.now() // Timestamp
    this.estimatedEV = estimatedEV
    this.progress = 0          // start at 0%
    this.status = "pending"    // Pending means task created but not started yet
  }

  // Marking task as active
  activate() {
    this.status = "active"
  }

  //  Mark for agent status and progress
  setProgress(fraction) {
    this.progress = Math.min(1, Math.max(0, fraction)) // If steps already half of the required then its 50%
  }
  succeed() {
    this.status = "succeeded" //deliverd
  }
  fail() {
    this.status = "failed" //stuck or couldnt reach target
  }
  drop() {
    this.status = "dropped" // package stolen or much more valuable task appear
  }

  // Check marker if task still relevant if its pending or active then it is ture.
  get isAlive() {
    return this.status === "pending" || this.status === "active"
  }
  // Log
  toString() {
    return `Intention(${this.predicate} ev=${this.estimatedEV.toFixed(1)} progress=${(this.progress * 100).toFixed(0)}% status=${this.status})`
  }
}
