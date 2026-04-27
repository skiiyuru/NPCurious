/**
 * This is a full execution plan for dropping off packages. When the Dispatcher 
 * hands the agent a "DELIVER" Work Order, this script takes over to ensure 
 * the entire job gets done from start to finish.
 * * CORE RESPONSIBILITIES:
 * * 1. THE REALITY CHECK (isApplicable):
 * Before starting, it double-checks its pockets: "Am I actually holding 
 * any packages right now?"
 * * 2. FINDING THE CLOSEST TARGET (execute - bestDirs):
 * Instead of just walking to a random delivery zone, it checks the distance 
 * to EVERY single delivery zone on the map and picks the one that requires 
 * the least amount of walking.
 * * 3. THE FINAL SEQUENCE (execute - return):
 * It strings together all the walking steps (using the GPS) and tacks on 
 * the final "putdown" command at the very end so the agent actually drops 
 * the packages when it arrives.
 * ============================================================================
 */

import { PlanBase } from "../PlanBase.js"
import { findPathWithFallback } from "../../utils/pathfinding.js"

export class GoDeliver extends PlanBase {
  static get planName() {
    return "GoDeliver"
  }

  // Check if plan to deliver is required to do
  isApplicable(intention) {
    return (
      intention.predicate === "DELIVER" &&
      this.queries.getCarriedParcels().length > 0
    )
  }

  /**
   * @param {import("../../intentions/Intention.js").Intention} intention
   * @returns {{ action: string, dir?: string }[]}
   */
  execute(intention) {
    const me = this.beliefBase.me
    if (!me) return []

    // Find shortest path to any delivery zone
    let bestDirs = null
    let bestLen = Infinity // holding value for shortest path

    const zones = this.queries.getDeliveryZones()
    for (const zone of zones) {
      const dirs = findPathWithFallback( // loop dropzone and check steps
        Math.round(me.x),
        Math.round(me.y),
        zone.x,
        zone.y,
        this.queries
      )
      if (dirs !== null && dirs.length < bestLen) { // saves route
        bestLen = dirs.length
        bestDirs = dirs
      }
    }

    if (!bestDirs) { // print error log
      this.log("No path to any delivery zone")
      return []
    }

    return [
      ...bestDirs.map((dir) => ({ action: "move", dir })),
      { action: "putdown" },
    ]
  }
}
