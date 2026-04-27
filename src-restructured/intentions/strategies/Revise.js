/**
 * This strategy ranks every single task by its Expected Value (EV). 
 * The task with the highest EV always gets moved to the top. However, 
 * it plans to implement two critical psychological/AI concepts to stop 
 * the agent from acting erratic:
 * * 1. HYSTERESIS (The "Is it worth the hassle?" Rule):
 * The agent won't abandon its current task just because a new one is 
 * $1 more profitable. The new task must be significantly better 
 * (e.g., 1.5x better) to justify the brain-power of switching gears.
 * * 2. SUNK-COST AWARENESS (The "I'm almost done!" Rule):
 * If the agent is 90% of the way to dropping off a package, it will 
 * NOT switch to a new package, even if that new package is highly 
 * valuable. It finishes what it started.
 * * NOTE: This is currently marked as a "Phase 4 TODO". The advanced 
 * hysteresis and sunk-cost math isn't fully coded yet; right now, 
 * it just sorts the list by value and picks the highest one.
 * ============================================================================
 */

import { Intention } from "../Intention.js"

const HYSTERESIS_THRESHOLD = 1.5   // The new task mush be 50% better than current one before switching
const SUNK_COST_THRESHOLD  = 0.9   // If current task progress is 90% dont swtich (We can try to fine tune this later)

// Check list to track task and check top list
export class ReviseStrategy {
  constructor() {
    /** @type {Intention[]} */
    this._queue = []
  }
  /** @returns {Intention | null} */
  get current() {
    return this._queue[0] ?? null
  }
  /** @returns {Intention[]} */
  get all() {
    return [...this._queue]
  }

  /**
   * @param {Intention} intention
   * @returns {boolean} true if the head intention changed
   */
  push(intention) {
    // implement full EV - reranks
    // Outline:
    // 1. Add intention to _queue
    // 2. Sort _queue descending by estimatedEV
    // 3. If new head !== old head:
    //    a. Check sunk-cost: if oldHead.progress >= SUNK_COST_THRESHOLD --> keep old head
    //    b. Check hysteresis: if newHead.estimatedEV < oldHead.estimatedEV * HYSTERESIS_THRESHOLD --> keep old head
    //    c. Otherwise drop old head and activate new head
    // For now: fall through to Replace behaviour
    const prev = this._queue[0] // Memory on wahgat agent was doing
    this._queue.push(intention) // writes the new task
    this._queue.sort((a, b) => b.estimatedEV - a.estimatedEV) // Sort list of task from highest EV to lowest

    const next = this._queue[0] // Look top list
    if (next !== prev) { // check if active task changes
      // If change cancel old task and start new one
      if (prev) prev.drop()
      next.activate()
      return true
    }
    return false
  }
  //  Cleaning part
  shift() {
    return this._queue.shift()
  }

  remove(predFn) {
    const before = this._queue.length
    this._queue = this._queue.filter((i) => !predFn(i))
    return before - this._queue.length
  }
  // Loop for every task and drop one by one just to be safe
  clear() {
    this._queue.forEach((i) => i.drop())
    this._queue = []
  }

  get size() {
    return this._queue.length
  }
}
