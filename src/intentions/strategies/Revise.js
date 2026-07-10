/** @fileoverview Revise commitment strategy: re-ranks by EV with hysteresis, sunk-cost, and delivery-lock guards. */

/**
 * Cautious strategy: allows preemption only when candidate is clearly superior.
 * Guards: EV multiplier threshold, sunk-cost progress cap, delivery-distance lock.
 */
export class ReviseStrategy {
  /**
   * @param {import('../../types.js').Config} config - Must include `switchThreshold`; optionally `deliveryDistanceLock`.
   */
  constructor(config) {
    this.config = config
  }

  /**
   * Revise queue on each deliberation cycle.
   * @param {import('../../intentions/Intention.js').Intention[]} queue
   * @param {import('../../intentions/Intention.js').Intention|null} candidate
   * @returns {import('../../intentions/Intention.js').Intention[]}
   */
  revise(queue, candidate) {
    const active = queue.filter(
      (
        /** @type {import('../../intentions/Intention.js').Intention} */ intention
      ) => !["achieved", "failed", "dropped"].includes(intention.status)
    )
    if (!candidate) return active

    const current = active[0]
    if (!current) return [candidate]
    if (current.samePredicate(candidate)) return active

    // User/LLM commands preempt immediately — bypass all BDI guards.
    if (candidate.source && candidate.source !== "bdi") {
      current.markDropped()
      return [candidate, ...active.slice(1)]
    }

    const muchBetter =
      candidate.estimatedEV > current.estimatedEV * this.config.switchThreshold
    const lowSunkCost = current.progress < 0.75
    const deliveryLocked =
      current.predicate?.type === "deliver" &&
      Number.isFinite(current.remainingDistance) &&
      current.remainingDistance <= (this.config.deliveryDistanceLock ?? 0)

    if (muchBetter && lowSunkCost && !deliveryLocked) {
      current.markDropped()
      return [candidate, ...active.slice(1)]
    }

    // Keep current; retain candidate as fallback alternative.
    const sortedAlternatives = this._buildAlternatives(
      active.slice(1),
      candidate,
      current
    )
    return [current, ...sortedAlternatives]
  }

  /**
   * Deduped alternatives (excluding current goal) sorted by descending EV.
   * @param {import('../../intentions/Intention.js').Intention[]} others
   * @param {import('../../intentions/Intention.js').Intention} candidate
   * @param {import('../../intentions/Intention.js').Intention} current
   * @returns {import('../../intentions/Intention.js').Intention[]}
   */
  _buildAlternatives(others, candidate, current) {
    const merged = [...others, candidate]
    /** @type {import('../../intentions/Intention.js').Intention[]} */
    const unique = []
    for (const intention of merged) {
      if (current.samePredicate(intention)) continue
      const alreadyKept = unique.some(
        (
          /** @type {import('../../intentions/Intention.js').Intention} */ kept
        ) => kept.samePredicate(intention)
      )
      if (alreadyKept) continue
      unique.push(intention)
    }
    return unique.sort(
      (
        /** @type {import('../../intentions/Intention.js').Intention} */ a,
        /** @type {import('../../intentions/Intention.js').Intention} */ b
      ) => b.estimatedEV - a.estimatedEV
    )
  }
}
