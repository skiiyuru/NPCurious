import { PlanBase, PlanFailure } from "../PlanBase.js"
import { astar, DIRECTION_DELTAS } from "../../utils/pathfinding.js"

/** @typedef {import('../../types.js').Position} Position */
/** @typedef {import('../../types.js').Option} Option */
/** @typedef {import('../PlanBase.js').PlanContext} PlanContext */

/**
 * Movement plan using A* (or external planner when injected).
 * Applicable to any intention with a `target` coordinate.
 */
export class AStarMove extends PlanBase {
  constructor() {
    super("AStarMove")
  }

  /**
   * @param {{ predicate: Option, [key: string]: any }} intention
   * @returns {boolean}
   */
  isApplicable(intention) {
    return Boolean(intention?.predicate?.target)
  }

  /**
   * Execute path step-by-step; reconsiders after every move.
   * Uses external planner when available; falls back to direct A*.
   * @param {{ predicate: Option, [key: string]: any }} intention
   * @param {PlanContext} context
   * @returns {Promise<void>}
   */
  async execute(intention, context) {
    const { beliefs, actions, reconsider, planner } = context
    const me = beliefs.me
    if (!me) throw new PlanFailure("no-self-belief", false)
    const target = intention.predicate.target
    if (!target) throw new PlanFailure("no-target", false)

    const isWalkable = (/** @type {number} */ x, /** @type {number} */ y) =>
      beliefs.isWalkable(x, y)
    const canEnterFrom = (
      /** @type {number} */ fx,
      /** @type {number} */ fy,
      /** @type {number} */ tx,
      /** @type {number} */ ty
    ) => beliefs.canEnterFrom(fx, fy, tx, ty)

    const path = planner
      ? await planner.plan(me, target, beliefs)
      : astar(me, target, isWalkable, canEnterFrom)

    if (!path) {
      // Mark blocked so next deliberation picks a reachable goal instead of re-selecting this one.
      beliefs.markBlocked(target.x, target.y)
      throw new PlanFailure("no-path-to-target", false)
    }

    const total = path.length
    let done = 0

    for (const direction of path) {
      this.checkStopped()
      const currentMe = beliefs.me
      if (!currentMe) throw new PlanFailure("no-self-belief", false)

      const delta = DIRECTION_DELTAS[direction]
      const next = { x: currentMe.x + delta.x, y: currentMe.y + delta.y }

      // Abort if next tile is now visibly blocked — don't walk into a known obstacle.
      if (beliefs.isTransientlyBlocked(next.x, next.y)) {
        throw new PlanFailure(`blocked-ahead:${direction}`, true)
      }

      const result = await actions.move(direction)

      if (!result) {
        beliefs.markBlocked(next.x, next.y)
        throw new PlanFailure(`move-failed:${direction}`, true)
      }

      // Revise self-belief immediately if the API returns new position.
      if (typeof result.x === "number" && typeof result.y === "number") {
        beliefs.reviseYou(
          currentMe.id,
          currentMe.name ?? "",
          result.x,
          result.y,
          currentMe.score
        )
      }

      done += 1
      intention.updateProgress?.(done, total)

      // Open-minded commitment: preempt when a better intention emerges.
      if (typeof reconsider === "function" && reconsider()) {
        const stop = new PlanFailure("reconsidered", true)
        stop.reconsidered = true
        throw stop
      }
    }
  }
}
