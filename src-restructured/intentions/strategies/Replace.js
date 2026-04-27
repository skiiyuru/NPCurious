/**
 * This file manages the agent's tasks, but unlike a waiting line (Queue), 
 * there is only room for ONE active goal. If a new intention arrives, it 
 * immediately interrupts and replaces whatever the agent is currently doing.
 * * CORE RESPONSIBILITIES:
 * * 1. VIEWING THE TASK
 * - current: Looks at the one and only sticky note.
 * - all: Wraps that single task in a list (just to keep the rest of the 
 * code happy, since other systems expect a list format).
 * * 2. REPLACING THE TASK (push)
 * - Checks if the new task is identical to the current one. If it is, 
 * it ignores the new request. If it's different, it cancels ("drops") the 
 * old task and starts ("activates") the new one.
 * * 3. CLEANING UP
 * - shift / clear / remove: Simple functions to throw away the current 
 * sticky note when the task is done or canceled.
 * ============================================================================
 */

import { Intention } from "../Intention.js"

export class ReplaceStrategy {
  constructor() {
    /** @type {Intention | null} */
    this._current = null
  }

  /** @returns {Intention | null} */
  // Hands back the active task
  get current() {
    return this._current
  }

  /** @returns {Intention[]} */
  //  Wrapping task in array to make it into list of format
  get all() {
    return this._current ? [this._current] : []
  }

  /**
   * @param {Intention} intention
   * @returns {boolean} true if the intention was actually replaced
   */
  // Check if task is the same or not return false if new task is the same that is going
  push(intention) {
    if (this._isSame(this._current, intention)) return false
    // if its different then drop then create new task
    if (this._current) this._current.drop()
    intention.activate()
    this._current = intention
    return true
  }

  /**
   * @returns {Intention | null}
   */
  // Mark current intention and clear
  shift() {
    const prev = this._current
    this._current = null
    return prev
  }
  // agent is asked to cancel a task that matches a specific rule predFn
  remove(_predFn) {
    // Replace strategy only has one slot; clear if predicate matches
    if (this._current && _predFn(this._current)) {
      this._current.drop()
      this._current = null
      return 1
    }
    return 0
  }

  clear() {
    if (this._current) this._current.drop()
    this._current = null
  }

  get size() {
    return this._current ? 1 : 0
  }

  // Check detail of the task
  /** @private */
  _isSame(a, b) {
    if (!a || !b) return false // if blank then not the same
    if (a.predicate !== b.predicate) return false // if type of action different then not same task
    if (!a.target || !b.target) return a.target === b.target // if no specific target then they are smae

    // Compare by parcels id or by position
    if (a.target.id && b.target.id) return a.target.id === b.target.id  //if have same id then its true
    return (
      Math.round(a.target.x) === Math.round(b.target.x) && 
      Math.round(a.target.y) === Math.round(b.target.y)
    )
  }
}
