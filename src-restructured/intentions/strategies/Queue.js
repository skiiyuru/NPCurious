/**
 * This file manages the agent's "Intentions" (its goals or tasks). 
 * It uses a strictly FIFO (First-In, First-Out) strategy. Think of it 
 * like a line of people waiting at a grocery store checkout. 
 * The agent always serves the task at the very front of the line until 
 * it is completely finished, and any new tasks are forced to wait at 
 * the very back of the line.
 * * CORE RESPONSIBILITIES:
 * * 1. VIEWING THE LIST
 * - current: Looks at the very top item on the to-do list (what the agent 
 * is actively working on right now).
 * - all: Gets a copy of the entire to-do list.
 * * 2. MANAGING THE LIST
 * - push: Writes a brand new task at the very bottom of the list.
 * - shift: Crosses off the top task once it's finished, moving the 
 * next task up to the #1 spot.
 * * 3. CLEANING UP
 * - remove: Scans the list and erases specific tasks (like if a package 
 * was stolen before the agent even started walking to it).
 * - clear: Throws the whole to-do list in the trash.
 * ============================================================================
 */

import { Intention } from "../Intention.js"

export class QueueStrategy {
  constructor() {
    /** @type {Intention[]} */
    this._queue = []
  }

  /** @returns {Intention | null} */
  //checking what to do right now
  get current() {
    return this._queue[0] ?? null
  }
  /** @returns {Intention[]} */
  // Take the to do list and preventing modifying ori list by copying the list
  get all() {
    return [...this._queue]
  }

  /**
   * @param {Intention} intention
   */
  // Fifo logic
  push(intention) {
    this._queue.push(intention)
  }

  /**
   * @returns {Intention | undefined}
   */
  // Remove head 
  shift() {
    return this._queue.shift()
  }

  /**
   * @param {(i: Intention) => boolean} predFn
   */
  // Cleaning the list that are still in queue
  // PREDfn is a rule that are asking the agent request
  remove(predFn) {
    const before = this._queue.length
    this._queue = this._queue.filter((i) => !predFn(i)) //Filtering items that do not match the rule
    return before - this._queue.length
  }
  // Cancel ALL
  clear() {
    this._queue = []
  }
  get size() {
    return this._queue.length
  }
}
