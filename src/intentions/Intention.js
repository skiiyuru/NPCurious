/** @fileoverview First-class intention object: selected option with lifecycle metadata. */

let nextId = 1

/**
 * Stable goal identity ignoring volatile scoring fields (reward, estimatedEV, parcel snapshots).
 * Two predicates match when they pursue the same logical goal regardless of per-cycle value changes.
 * @param {import('../types.js').Option|null|undefined} predicate
 * @returns {string}
 */
function goalIdentity(predicate) {
  if (!predicate || typeof predicate !== "object") return String(predicate)

  const at = predicate.target
    ? `@${predicate.target.x},${predicate.target.y}`
    : ""

  switch (predicate.type) {
    case "pickup": {
      // ?? not || so empty-string parcelId is preserved.
      const pickupKey = predicate.parcelId ?? at
      return `pickup:${pickupKey}`
    }
    case "deliver": {
      // Sort so same batch in any order gives same key.
      const sortedIds = [...(predicate.parcelIds ?? [])].sort()
      return `deliver:${sortedIds.join(",")}`
    }
    case "move":
      return `move${at}`
    case "explore": {
      // || so empty `at` also falls back to ':idle'.
      return `explore${at || ":idle"}`
    }
    default:
      return `${predicate.type}${at}`
  }
}

/**
 * An adopted commitment: wraps an Option with lifecycle state, progress tracking, and source info.
 */
export class Intention {
  /**
   * @param {import('../types.js').Option} predicate
   * @param {number} [estimatedEV=0]
   * @param {string} [source='bdi']
   */
  constructor(predicate, estimatedEV = 0, source = "bdi") {
    this.id = `intention-${nextId++}`
    this.predicate = predicate
    this.createdAt = Date.now()
    this.estimatedEV = estimatedEV
    this.progress = 0
    this.remainingDistance = Infinity
    this.status = "pending"
    this.source = source
  }

  /**
   * Update sunk-cost progress as plan advances.
   * @param {number} done - Steps completed.
   * @param {number} total - Total planned steps.
   */
  updateProgress(done, total) {
    if (total > 0) this.progress = Math.min(1, done / total)
    this.remainingDistance = Math.max(0, total - done)
  }

  /**
   * True when both intentions pursue the same logical goal (uses goalIdentity).
   * @param {Intention|null|undefined} other
   * @returns {boolean}
   */
  samePredicate(other) {
    return goalIdentity(this.predicate) === goalIdentity(other?.predicate)
  }

  /** Mark actively being pursued. */
  markRunning() {
    this.status = "running"
  }

  /** Mark successfully achieved. */
  markAchieved() {
    this.status = "achieved"
    this.progress = 1
  }

  /** Mark intentionally abandoned. */
  markDropped() {
    this.status = "dropped"
  }
}
