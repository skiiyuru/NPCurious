import { PlanBase, PlanFailure } from "../PlanBase.js"
import { manhattan, samePosition } from "../../utils/distance.js"

/** Greedy fallback: steps toward target without map planning. */
export class BlindMove extends PlanBase {
  constructor() {
    super("BlindMove")
  }

  /**
   * @param {import('../../intentions/Intention.js').Intention} intention
   * @returns {boolean}
   */
  isApplicable(intention) {
    return Boolean(intention?.predicate?.target)
  }

  /**
   * Greedily step toward target one tile at a time, reconsidering after each move.
   * @param {import('../../intentions/Intention.js').Intention} intention
   * @param {import('../PlanBase.js').PlanContext} context
   * @returns {Promise<void>}
   */
  async execute(intention, context) {
    const { beliefs, actions, reconsider } = context
    const target = intention.predicate.target
    if (!target) throw new PlanFailure("no-target", false)

    const startDistance = Math.max(1, manhattan(beliefs.me, target))

    while (!samePosition(beliefs.me, target)) {
      this.checkStopped()

      const me = beliefs.me
      if (!me) throw new PlanFailure("no-self-belief", false)

      const direction = chooseDirection(me, target)
      const before = { x: me.x, y: me.y }
      const result = await actions.move(direction)

      if (!result) throw new PlanFailure(`blind-move-failed:${direction}`, true)
      if (didNotMove(before, result, beliefs.me)) {
        throw new PlanFailure(`blind-move-stuck:${direction}`, true)
      }

      const remaining = manhattan(beliefs.me, target)
      intention.updateProgress?.(startDistance - remaining, startDistance)

      if (typeof reconsider === "function" && reconsider()) {
        const stop = new PlanFailure("reconsidered", true)
        stop.reconsidered = true
        throw stop
      }
    }
  }
}

/**
 * True when the move left position unchanged (agent stuck).
 * @param {import('../../types.js').Position} before
 * @param {import('../../types.js').Position} result
 * @param {import('../../types.js').Position|null|undefined} now
 * @returns {boolean}
 */
function didNotMove(before, result, now) {
  const beliefUnchanged = manhattan(before, now) === 0
  const resultUnchanged = result.x === before.x && result.y === before.y
  return beliefUnchanged && resultUnchanged
}

/**
 * Greedy direction: reduce x distance first, then y.
 * @param {import('../../types.js').Position} me
 * @param {import('../../types.js').Position} target
 * @returns {string} 'right' | 'left' | 'up' | 'down'
 */
function chooseDirection(me, target) {
  if (target.x > me.x) return "right"
  if (target.x < me.x) return "left"
  if (target.y > me.y) return "up"
  return "down"
}
