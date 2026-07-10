/** @fileoverview FIFO commitment strategy: keeps existing intentions, appends new unique ones. */

/**
 * Accumulates intentions; appends candidate only when not already queued.
 */
export class QueueStrategy {
  /**
   * @param {import('../../intentions/Intention.js').Intention[]} queue
   * @param {import('../../intentions/Intention.js').Intention|null} candidate
   * @returns {import('../../intentions/Intention.js').Intention[]}
   */
  revise(queue, candidate) {
    if (!candidate) return queue
    if (queue.some((intention) => intention.samePredicate(candidate)))
      return queue
    return [...queue, candidate]
  }
}
