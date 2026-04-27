/** 
 * This plan acts as a smart scout, looking for the most logical place to uncover next.
 * * CORE RESPONSIBILITIES:
 * * 1. THE 4-STEP PRIORITY CHECKLIST (_nextExplorationTarget):
 * To explore efficiently, it searches for targets in this exact order:
 * Tier 1: Unvisited Spawn Tiles (Where new packages might be hiding!)
 * Tier 2: Frontier Tiles (The edge of the map; unvisited tiles right next 
 * to ones we have already walked on).
 * Tier 3: Least-Visited Spawn Tiles (Let's check the spawns again).
 * Tier 4: Any Walkable Tile (Just go wherever we haven't been in a while).
 * * 2. EXECUTING THE MOVE (execute):
 * Once it picks a target from that list, it updates its Work Order, asks 
 * the GPS for directions, and starts walking.
 * ============================================================================
 */

import { PlanBase } from "../PlanBase.js"
import { findPath, findPathWithFallback } from "../../utils/pathfinding.js"
import { manhattan } from "../../utils/distance.js"

const DIRS = Object.freeze([
  [0, 1, "up"],
  [0, -1, "down"],
  [1, 0, "right"],
  [-1, 0, "left"],
])

export class GoExplore extends PlanBase {
  static get planName() {
    return "GoExplore"
  }

  // Only if explore happen
  isApplicable(intention) {
    return intention.predicate === "EXPLORE"
  }

  /**
   * @param {import("../../intentions/Intention.js").Intention} intention
   * @returns {{ action: string, dir?: string }[]}
   */
  // Checking current location
  execute(intention) {
    const me = this.beliefBase.me
    if (!me) return []
    const fromX = Math.round(me.x)
    const fromY = Math.round(me.y)

    // Use the target stored on the intention if it'still valid and we are not in the coordinate
    let target = intention.target
    if (target && Math.round(target.x) === fromX && Math.round(target.y) === fromY) {
      target = null // reached old target, need a new one
    }

    if (!target) {
      target = this._nextExplorationTarget(fromX, fromY, null)
    }
    if (!target) {
      this.log("No exploration target found — map fully explored")
      return []
    }

    intention.target = target
    // writing new destionation
    const dirs = findPathWithFallback(fromX, fromY, target.x, target.y, this.queries)
    if (dirs === null) {
      this.log(`No path to exploration target (${target.x},${target.y})`)
      return []
    }

    return dirs.map((dir) => ({ action: "move", dir }))
  }

// This function below passes list of spawning zone that never visited
  _nextExplorationTarget(fromX, fromY, currentTarget) {
    // 1. Unvisited spawn tiles — shortest path first
    const unvisitedSpawns = this.beliefBase.spawnTiles.filter(
      (t) => this.beliefBase.getVisitCount(t.x, t.y) === 0
    )
    const bestUnvisited = this._bestReachable(unvisitedSpawns, fromX, fromY, currentTarget,
      (_t, pathLen) => pathLen)
    if (bestUnvisited) return bestUnvisited

// This function below will filter non wall tiles filter that already visited and check unwill check univsited tiles that gives -1 to the path lenght if there is a spawn tile
    const walkable = [...this.beliefBase.map.values()].filter((t) => t.type !== "0")
    const frontier = walkable.filter((t) => {
      if (this.beliefBase.getVisitCount(t.x, t.y) > 0) return false
      return DIRS.some(([dx, dy]) =>
        this.beliefBase.getVisitCount(t.x + dx, t.y + dy) > 0
      )
    })
    const isSpawn = (t) =>
      this.beliefBase.spawnTiles.some((s) => s.x === t.x && s.y === t.y)
    const bestFrontier = this._bestReachable(frontier, fromX, fromY, currentTarget,
      (t, pathLen) => pathLen + (isSpawn(t) ? -1 : 0))
    if (bestFrontier) return bestFrontier

    // Penalizes tiles that been visited too many times
    const bestSpawn = this._bestReachable(this.beliefBase.spawnTiles, fromX, fromY, currentTarget,
      (t, pathLen) => this.beliefBase.getVisitCount(t.x, t.y) * 100 + pathLen +
        manhattan(fromX, fromY, t.x, t.y))
    if (bestSpawn) return bestSpawn

    // Do explore least visited tiles
    const allWalkable = walkable.map((t) => ({ x: t.x, y: t.y }))
    return this._bestReachable(allWalkable, fromX, fromY, currentTarget,
      (t, pathLen) => pathLen + this.beliefBase.getVisitCount(t.x, t.y) * 4)
  }

  /**
   * @private
   */
  //  This will list all the tiels that have good score that ignore target tiles, agents, or crates because we want to explore
  _bestReachable(tiles, fromX, fromY, currentTarget, scoreFn) {
    let best = null
    for (const tile of tiles) {
      if (Math.round(tile.x) === fromX && Math.round(tile.y) === fromY) continue
      if (currentTarget &&
        Math.round(tile.x) === Math.round(currentTarget.x) &&
        Math.round(tile.y) === Math.round(currentTarget.y)) continue

      const path = findPath(fromX, fromY, tile.x, tile.y, this.queries, {
        avoidAgents: false,
        avoidCrates: false,
      })
      if (!path) continue

      const score = scoreFn(tile, path.length)
      if (!best || score < best.score) {
        best = { x: tile.x, y: tile.y, dist: path.length, score }
      }
    }
    return best
  }
}
