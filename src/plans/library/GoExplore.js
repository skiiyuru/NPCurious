import { PlanBase, PlanFailure } from "../PlanBase.js"
import { AStarMove } from "./AStarMove.js"
import { samePosition } from "../../utils/distance.js"

/** @typedef {import('../../types.js').Position} Position */

/**
 * Spawner tiles (type '1') sorted by (x, y) for stable round-robin patrol.
 * Falls back to all walkable tiles when no spawners are known.
 * @param {import('../../types.js').Beliefs} beliefs
 * @returns {Position[]}
 */
function patrolTargets(beliefs) {
  /** @type {Position[]} */
  const spawners = []
  /** @type {Position[]} */
  const walkable = []
  for (const tile of beliefs.tiles.values()) {
    if (tile.type === "0" || tile.x === undefined || tile.y === undefined)
      continue
    const pos = { x: tile.x, y: tile.y }
    walkable.push(pos)
    if (tile.type === "1") spawners.push(pos)
  }
  const targets = spawners.length > 0 ? spawners : walkable
  targets.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y))
  return targets
}

/**
 * Patrol plan: cycles spawner tiles in round-robin order when agent is idle.
 * Reuses AStarMove with per-step reconsideration — preempted instantly on parcel sense.
 */
export class GoExplore extends PlanBase {
  constructor() {
    super("GoExplore")
    this.movePlan = new AStarMove()
    /** Round-robin cursor over patrol targets, persisted across legs. */
    this.patrolIndex = 0
    /** @type {Position|null} */
    this.currentTarget = null
  }

  /**
   * @param {import('../../intentions/Intention.js').Intention} intention
   * @returns {boolean}
   */
  isApplicable(intention) {
    return intention?.predicate?.type === "explore"
  }

  /**
   * Head to the next patrol point; reroutes on recoverable failure, forgets target on non-recoverable.
   * @param {import('../../intentions/Intention.js').Intention} intention
   * @param {import('../PlanBase.js').PlanContext} context
   * @returns {Promise<void>}
   */
  async execute(intention, context) {
    const target = this.nextTarget(context.beliefs)
    if (!target) throw new PlanFailure("nothing-to-explore", false)
    try {
      await this.movePlan.execute(
        { predicate: { type: "explore", target } },
        context
      )
      this.currentTarget = null // Arrived: advance to next patrol point next time.
    } catch (error) {
      // Recoverable failure (blocker, preemption): keep target to reroute toward same point.
      // Non-recoverable: forget target and try another.
      const isRecoverable = /** @type {any} */ (error)?.recoverable
      if (!isRecoverable) this.currentTarget = null
      throw error
    }
  }

  /**
   * Resume current leg if not yet arrived; otherwise advance cursor to next distinct patrol point.
   * Keeping the in-progress target stops zig-zagging when a step is briefly blocked.
   * @param {import('../../types.js').Beliefs} beliefs
   * @returns {Position|null}
   */
  nextTarget(beliefs) {
    const me = beliefs.me
    const targets = patrolTargets(beliefs)
    if (!me || targets.length === 0) return null

    if (this.currentTarget && !samePosition(me, this.currentTarget))
      return this.currentTarget

    for (let attempt = 0; attempt < targets.length; attempt += 1) {
      const candidate = targets[this.patrolIndex % targets.length]
      this.patrolIndex = (this.patrolIndex + 1) % targets.length
      if (samePosition(me, candidate)) continue
      if (beliefs.isTransientlyBlocked(candidate.x, candidate.y)) continue
      this.currentTarget = candidate
      return candidate
    }

    return null
  }
}
