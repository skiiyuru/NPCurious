/** @fileoverview Replace commitment strategy: always adopt the latest selected option. */

/**
 * Reactive strategy: replaces current intention with any new candidate (open commitment).
 */
export class ReplaceStrategy {
  /**
   * @param {import('../../intentions/Intention.js').Intention[]} queue
   * @param {import('../../intentions/Intention.js').Intention|null} candidate
   * @returns {import('../../intentions/Intention.js').Intention[]}
   */
  revise(queue, candidate) {
    if (!candidate) return queue
    const current = queue[0]
    if (current?.samePredicate(candidate)) return queue
    current?.markDropped()
    return [candidate]
  }
}
