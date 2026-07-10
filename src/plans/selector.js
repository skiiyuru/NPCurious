import { GoPickUp } from "./library/GoPickUp.js"
import { GoDeliver } from "./library/GoDeliver.js"
import { GoExplore } from "./library/GoExplore.js"
import { AStarMove } from "./library/AStarMove.js"
import { BlindMove } from "./library/BlindMove.js"

/** @typedef {import('../types.js').Option} Option */

/**
 * Picks the first applicable plan from the library for the active intention.
 * Plans ordered most- to least-specific; first `isApplicable` match wins.
 */
export class PlanSelector {
  /**
   * @param {import('./PlanBase.js').PlanBase[]} [planLibrary]
   */
  constructor(
    planLibrary = [
      new GoPickUp(),
      new GoDeliver(),
      new GoExplore(),
      new AStarMove(),
      new BlindMove(),
    ]
  ) {
    this.planLibrary = planLibrary
  }

  /**
   * First plan whose `isApplicable` returns true, or null if none match.
   * @param {import('../intentions/Intention.js').Intention} intention
   * @returns {import('./PlanBase.js').PlanBase | null}
   */
  select(intention) {
    for (const plan of this.planLibrary) {
      if (plan.isApplicable(intention)) return plan
    }
    return null
  }
}
