/**
 * External planner: build PDDL, solve online, validate, fall back to A* on any failure.
 */

import { astar } from "../../utils/pathfinding.js"
import { buildDomain } from "./domain.js"
import { buildProblem } from "./problemBuilder.js"
import { parsePlan } from "./planParser.js"
import { solveOnline } from "./onlineSolver.js"

/** @typedef {import('../../types.js').Position} Position */
/** @typedef {import('../../types.js').Beliefs} Beliefs */

/**
 * @typedef {Object} PlannerOptions
 * @property {boolean} [usePlanner] - false = pure A* (offline/tests).
 * @property {string} [url] - custom solver endpoint.
 * @property {number} [timeoutMs] - solver request budget.
 * @property {(domain: string, problem: string, options?: { url?: string, timeoutMs?: number }) => Promise<any> | any} [solver] - injectable for tests.
 */

/** @type {{ right: Position, left: Position, up: Position, down: Position }} */
const DELTA = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
}

/**
 * Replay directions from `start`; null on unknown direction.
 * @param {Position} start
 * @param {string[]} directions
 * @returns {Position[] | null}
 */
function simulate(start, directions) {
  let { x, y } = start
  const visited = [{ x, y }]
  for (const direction of directions) {
    const delta = DELTA[/** @type {keyof typeof DELTA} */ (direction)]
    if (!delta) return null
    x += delta.x
    y += delta.y
    visited.push({ x, y })
  }
  return visited
}

/**
 * True when path ends on goal, intermediates are walkable, and one-way rules hold on every edge.
 * @param {Position} start
 * @param {Position} goal
 * @param {string[]} directions
 * @param {Beliefs} beliefs
 * @returns {boolean}
 */
function isValidPath(start, goal, directions, beliefs) {
  const visited = simulate(start, directions)
  if (!visited) return false

  const last = visited[visited.length - 1]
  if (last.x !== goal.x || last.y !== goal.y) return false

  for (let i = 1; i < visited.length; i += 1) {
    const cell = visited[i]
    const prev = visited[i - 1]
    const atGoal = cell.x === goal.x && cell.y === goal.y
    if (!atGoal && !beliefs.isWalkable(cell.x, cell.y)) return false
    if (!beliefs.canEnterFrom(prev.x, prev.y, cell.x, cell.y)) return false
  }
  return true
}

export class ExternalPlanner {
  /** @param {PlannerOptions} [options] */
  constructor({
    usePlanner = true,
    url,
    timeoutMs,
    solver = solveOnline,
  } = {}) {
    this.usePlanner = usePlanner
    this.solverOptions = { url, timeoutMs }
    this.solver = solver
  }

  /**
   * Local A* fallback using same walkability + one-way rules as the validator.
   * @param {Position} start
   * @param {Position} goal
   * @param {Beliefs} beliefs
   * @returns {string[] | null}
   */
  fallback(start, goal, beliefs) {
    return astar(
      start,
      goal,
      (/** @type {number} */ x, /** @type {number} */ y) =>
        beliefs.isWalkable(x, y),
      (
        /** @type {number} */ fx,
        /** @type {number} */ fy,
        /** @type {number} */ tx,
        /** @type {number} */ ty
      ) => beliefs.canEnterFrom(fx, fy, tx, ty)
    )
  }

  /**
   * Plan start → goal: online solver → validate → A* fallback on any failure.
   * @param {Position} start
   * @param {Position} goal
   * @param {Beliefs} beliefs
   * @returns {Promise<string[] | null>} directions, [] if already at goal, null if unreachable.
   */
  async plan(start, goal, beliefs) {
    if (!this.usePlanner || !start || !goal) {
      // console.log("[planner] disabled, using A*")
      return this.fallback(start, goal, beliefs)
    }
    try {
      const domain = buildDomain()
      const problem = buildProblem(beliefs, start, goal)
      // console.log("[planner] submitting to online solver")
      const raw = await this.solver(domain, problem, this.solverOptions)
      if (raw == null) {
        // console.log("[planner] solver unavailable, falling back to A*")
        return this.fallback(start, goal, beliefs)
      }
      const directions = parsePlan(raw)
      if (directions == null) {
        // console.log("[planner] unparseable result, falling back to A*")
        return this.fallback(start, goal, beliefs)
      }
      if (directions.length === 0) {
        // console.log("[planner] already at goal")
        return []
      }
      if (!isValidPath(start, goal, directions, beliefs)) {
        // console.log("[planner] invalid path, falling back to A*")
        return this.fallback(start, goal, beliefs)
      }
      // console.log(
      //   "[planner] online plan:",
      //   directions.length,
      //   "steps ->",
      //   directions.join(", ")
      // )
      return directions
    } catch (e) {
      // console.log("[planner] error, falling back to A*:", e?.message ?? e)
      return this.fallback(start, goal, beliefs)
    }
  }
}
