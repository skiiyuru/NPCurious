/**
 * This file is a "Plan". When the agent finally decides to do something 
 * (like go to a package), it uses this GPS to figure out the actual physical 
 * steps required to get there. It uses the A* (A-Star) pathfinding algorithm, 
 * which is the standard video game math for finding the shortest route 
 * around obstacles.
 * * CORE RESPONSIBILITIES:
 * * 1. CHECKING THE ADDRESS (isApplicable):
 * Before turning on the GPS, it verifies that the destination actually 
 * has a valid X and Y coordinate on the map.
 * * 2. CALCULATING THE ROUTE (execute):
 * It looks at where the agent is standing right now, plots a path around 
 * walls and other players, and generates a turn-by-turn route.
 * * 3. FORMATTING COMMANDS:
 * It translates raw directions (like "up", "right") into the exact 
 * code format the game server requires to move the robot's legs: 
 * { action: "move", dir: "up" }.
 * ============================================================================
 */

import { PlanBase } from "../PlanBase.js"
import { findPathWithFallback } from "../../utils/pathfinding.js"

export class AStarMove extends PlanBase {
  static get planName() {
    return "AStarMove"
  }

  //  Ask to calculate route with atarget and coordinate of target
  isApplicable(intention) {
    return (
      intention.target &&
      typeof intention.target.x === "number" &&
      typeof intention.target.y === "number"
    )
  }

  /**
   * @param {import("../../intentions/Intention.js").Intention} intention
   * @returns {{ action: string, dir?: string }[]}
   */
  //  Generating route
  execute(intention) {
    const me = this.beliefBase.me
    if (!me) return []
  // This will calulcate the direction with a* logic and return the output up down, etc
    const dirs = findPathWithFallback(
      me.x,
      me.y,
      intention.target.x,
      intention.target.y,
      this.queries
    )
    //  If calculation fail then return nothing and write error log
    if (dirs === null) {
      this.log(`No path to (${intention.target.x},${intention.target.y})`)
      return []
    }

    return dirs.map((dir) => ({ action: "move", dir }))
  }
}
