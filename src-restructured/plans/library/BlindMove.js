/**
 * This is a backup plan. If the A* Pathfinding (the GPS) fails to find a 
 * route, the agent falls back to this script. It does not plan a full route. 
 * Instead, it just looks at the target and takes a single step in that 
 * general direction, acting purely on immediate instinct.
 * * CORE RESPONSIBILITIES:
 * * 1. CHECKING THE ADDRESS (isApplicable)
 * - Confirms the task is a physical movement task (PICKUP, DELIVER, EXPLORE) 
 * and has valid map coordinates.
 * * 2. FILTERING BAD STEPS (execute - filter)
 * - Checks the 4 immediate tiles (Up, Down, Left, Right). It throws out 
 * any directions that are solid walls, or directions the agent just 
 * bumped its head against.
 * * 3. PICKING THE BEST STEP (execute - sort)
 * - Of the remaining safe steps, it calculates which one puts it physically 
 * closer to the destination, and returns just that ONE single step.
 * ============================================================================
 */

import { PlanBase } from "../PlanBase.js"
import { manhattan } from "../../utils/distance.js"

const DIRS = [
  [0, 1, "up"],
  [0, -1, "down"],
  [1, 0, "right"],
  [-1, 0, "left"],
]

export class BlindMove extends PlanBase {
  static get planName() {
    return "BlindMove"
  }

  // Making sure the intention is a movement based task
  isApplicable(intention) {
    return (
      ["PICKUP", "DELIVER", "EXPLORE"].includes(intention.predicate) &&
      intention.target &&
      typeof intention.target.x === "number" &&
      typeof intention.target.y === "number"
    )
  }

  /**
   * @param {import("../../intentions/Intention.js").Intention} intention
   * @returns {{ action: string, dir?: string }[]}
   */
  execute(intention) {
    const me = this.beliefBase.me
    if (!me) return []

    const tx = Math.round(intention.target.x) //target coordinate
    const ty = Math.round(intention.target.y)
    const sx = Math.round(me.x) // agetn position
    const sy = Math.round(me.y)

    if (sx === tx && sy === ty) return [] //return empty list if agents standing on position

    // Sort directions by how much they reduce Manhattan distance to target
    const candidates = DIRS //check all posibile direction
      .filter(([dx, dy, dir]) => {
        const nx = sx + dx // new coordinate if agent take the direction
        const ny = sy + dy
        if (this.queries.isDirectionBlocked(sx, sy, dir)) return false
        if (!this.queries.isWalkable(nx, ny)) return false
        return true
      })
      // list of safe step from best to worst
      .sort((a, b) => {
        const da = manhattan(sx + a[0], sy + a[1], tx, ty)
        const db = manhattan(sx + b[0], sy + b[1], tx, ty)
        return da - db
      })

    if (candidates.length === 0) return [] // give up if all direction blocked

    const [, , dir] = candidates[0]
    this.log(`BlindMove → ${dir} (target ${tx},${ty})`)
    return [{ action: "move", dir }]
  }
}
