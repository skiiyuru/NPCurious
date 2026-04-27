/**
 * This file acts as the Foreman who decides *which* plan to use for a 
 * specific task. It uses a ranked list (Priority Order). 
 * * CORE RESPONSIBILITIES:
 * * 1. PRIORITIZATION (The Bookshelf):
 * Plans are loaded onto the Foreman's shelf in a specific order. The smart, 
 * complex plans (like the GPS pathfinder) are placed at the front. The dumb, 
 * fallback plans (like the Blind Move compass) are placed at the back.
 * * 2. SELECTION (selectPlan):
 * When handed a task, it reads through the shelf from left to right. It asks 
 * every plan `isApplicable()`. The moment it finds a plan that says "Yes", 
 * it stops searching and uses that plan.
 * * 3. EXPANSION (register):
 * Allows the system to add brand new manuals to the end of the shelf while 
 * the game is running.
 * ============================================================================
 */

export class PlanSelector {
  /**
   * @param {import("./PlanBase.js").PlanBase[]} planLibrary
   */
  constructor(planLibrary) {
    this._library = planLibrary
  }

  /**
   * @param {import("../intentions/Intention.js").Intention} intention
   * @returns {import("./PlanBase.js").PlanBase | null}
   */
  // / SAelect best applicatble plant for current intention
  selectPlan(intention) {
    for (const plan of this._library) {
      if (plan.isApplicable(intention)) {
        console.log(
          `[PlanSelector] ${plan.constructor.name} selected for ${intention.predicate}`
        )
        return plan
      }
    }
    console.warn(
      `[PlanSelector] No applicable plan for predicate="${intention.predicate}"`
    )
    return null
  }

  /**
   * @param {import("./PlanBase.js").PlanBase} plan
   */
  register(plan) {
    this._library.push(plan)
  }
}
