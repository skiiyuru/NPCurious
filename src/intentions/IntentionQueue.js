/** @fileoverview IntentionQueue: holds intentions and delegates revision to a pluggable strategy. */

import { Intention } from "./Intention.js"
import { ReplaceStrategy } from "./strategies/Replace.js"

/**
 * Ordered list of active intentions; revision delegated to the injected strategy.
 */
export class IntentionQueue {
  /**
   * @param {{ revise: (queue: Intention[], candidate: Intention|null) => Intention[] }} [strategy]
   */
  constructor(strategy = new ReplaceStrategy()) {
    this.strategy = strategy
    /** @type {Intention[]} */
    this.queue = []
  }

  /**
   * Current intention (index 0) or null when empty.
   * @returns {Intention|null}
   */
  current() {
    return this.queue[0] ?? null
  }

  /**
   * Wrap selection as Intention and let the strategy revise the queue.
   * @param {{ option: import('../types.js').Option, estimatedEV: number }|null} selection
   * @param {string} [source='bdi']
   * @returns {Intention|null}
   */
  revise(selection, source = "bdi") {
    /** @type {Intention|null} */
    let candidate = null
    if (selection) {
      candidate = new Intention(selection.option, selection.estimatedEV, source)
    }
    this.queue = this.strategy.revise(this.queue, candidate)
    return this.current()
  }

  /**
   * Remove and drop the current intention.
   * @returns {Intention|undefined}
   */
  dropCurrent() {
    const current = this.queue.shift()
    current?.markDropped()
    return current
  }

  /**
   * Remove and mark the current intention achieved.
   * @returns {Intention|undefined}
   */
  completeCurrent() {
    const current = this.queue.shift()
    current?.markAchieved()
    return current
  }

  /**
   * Drop invalid intentions from the queue head until head is valid or queue is empty.
   * @param {(intention: Intention) => boolean} isValid
   */
  removeInvalid(isValid) {
    while (this.queue[0] && !isValid(this.queue[0])) {
      this.dropCurrent()
    }
  }
}
