/**
 * This is the full execution plan for grabbing a package. When the Dispatcher 
 * hands the agent a "PICKUP" Work Order, this script takes over to ensure 
 * the agent actually gets its hands on the box.
 * * CORE RESPONSIBILITIES:
 * * 1. THE SANITY CHECKS (isApplicable & execute):
 * Before taking a single step, it verifies: Does the target have a valid ID? 
 * Does the package still exist in the Notebook? Is someone else already 
 * carrying it?
 * * 2. CALCULATING THE ROUTE (execute):
 * It asks the GPS for the shortest path to the exact X,Y coordinates of 
 * the package.
 * * 3. THE FINAL SEQUENCE (execute - return):
 * It strings together all the walking steps and tacks on the final 
 * "pickup" command at the very end so the agent actually grabs the box.
 * ============================================================================
 */

import { PlanBase } from "../PlanBase.js"
import { findPathWithFallback } from "../../utils/pathfinding.js"

export class GoPickUp extends PlanBase {
  static get planName() {
    return "GoPickUp"
  }

  // / Same do intnetion check
  isApplicable(intention) {
    return intention.predicate === "PICKUP" && intention.target?.id != null
  }

  /**
   * @param {import("../../intentions/Intention.js").Intention} intention
   * @returns {{ action: string, dir?: string }[]}
   */
  execute(intention) {
    const me = this.beliefBase.me
    if (!me) return []

    const parcel = this.beliefBase.parcels.get(intention.target.id) // check parcel id
    if (!parcel) { // if gone then despawed return log
      this.log(`Parcel ${intention.target.id} not found in beliefs`)
      return []
    }
    if (parcel.carriedBy) { // same if already carried by someone
      this.log(`Parcel ${intention.target.id} already carried by ${parcel.carriedBy}`)
      return []
    }

    const dirs = findPathWithFallback( // return agent location and parcel locations
      Math.round(me.x),
      Math.round(me.y),
      Math.round(parcel.x),
      Math.round(parcel.y),
      this.queries
    )

    if (dirs === null) { // if parcel block return null
      this.log(`No path to parcel ${intention.target.id} at (${parcel.x},${parcel.y})`)
      return []
    }

    return [ //direction log
      ...dirs.map((dir) => ({ action: "move", dir })),
      { action: "pickup" },
    ]
  }
}
