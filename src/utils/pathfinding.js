/** @fileoverview A* pathfinding over the Deliveroo tile grid. Public export: `astar`. */

import { manhattan, samePosition } from "./distance.js"

/**
 * Legal grid moves. Canonical source of truth: up = y+1, down = y-1.
 * @type {{ name: string, dx: number, dy: number }[]}
 */
export const DIRECTIONS = [
  { name: "right", dx: 1, dy: 0 },
  { name: "left", dx: -1, dy: 0 },
  { name: "up", dx: 0, dy: 1 },
  { name: "down", dx: 0, dy: -1 },
]

/** Movement vectors keyed by direction name (e.g. DIRECTION_DELTAS.up → { x: 0, y: 1 }). */
export const DIRECTION_DELTAS =
  /** @type {Record<string, {x: number, y: number}>} */ (
    Object.fromEntries(DIRECTIONS.map((d) => [d.name, { x: d.dx, y: d.dy }]))
  )

/**
 * Score of a node, defaulting to Infinity when not yet discovered.
 * @param {Map<string, number>} score
 * @param {string} nodeKey
 * @returns {number}
 */
function scoreOf(score, nodeKey) {
  return score.get(nodeKey) ?? Infinity
}

/**
 * Serialize position to Map/Set key.
 * @param {import('../types.js').Position} pos
 * @returns {string}
 */
function key(pos) {
  return `${pos.x},${pos.y}`
}

/**
 * Open node with lowest f-score.
 * @param {Set<string>} openSet
 * @param {Map<string, number>} score
 * @returns {string|null}
 */
function lowestScore(openSet, score) {
  let best = /** @type {string|null} */ (null)
  let bestScore = Infinity
  for (const node of openSet) {
    const value = scoreOf(score, node)
    if (value < bestScore) {
      best = node
      bestScore = value
    }
  }
  return best
}

/**
 * Rebuild direction path by walking parent pointers from goal to start.
 * @param {Map<string, {previous: string, direction: string}>} cameFrom
 * @param {string} currentKey
 * @returns {string[]}
 */
function reconstruct(cameFrom, currentKey) {
  const path = /** @type {string[]} */ ([])
  let cursor = currentKey
  while (cameFrom.has(cursor)) {
    const step = cameFrom.get(cursor)
    if (!step) break
    path.unshift(step.direction)
    cursor = step.previous
  }
  return path
}

/**
 * A* from `start` to `goal` over walkable tiles.
 * @param {import('../types.js').Position|null|undefined} start
 * @param {import('../types.js').Position|null|undefined} goal
 * @param {(x: number, y: number) => boolean} isWalkable
 * @param {(fromX: number, fromY: number, toX: number, toY: number) => boolean} [canEnter]
 * @returns {string[]|null} Ordered directions, `[]` if already there, `null` if unreachable.
 */
export function astar(start, goal, isWalkable, canEnter) {
  if (!start || !goal) return []
  if (samePosition(start, goal)) return []

  const startKey = key(start)
  const goalKey = key(goal)
  const openSet = new Set([startKey])
  const cameFrom =
    /** @type {Map<string, {previous: string, direction: string}>} */ (
      new Map()
    )
  const gScore = new Map([[startKey, 0]])
  const fScore = new Map([[startKey, manhattan(start, goal)]])
  const positions = new Map([[startKey, { x: start.x, y: start.y }]])

  while (openSet.size > 0) {
    const currentKey = lowestScore(openSet, fScore)
    if (!currentKey) break
    const current = positions.get(currentKey)
    if (!current) break

    if (currentKey === goalKey) {
      return reconstruct(cameFrom, currentKey)
    }

    openSet.delete(currentKey)

    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.dx, y: current.y + direction.dy }
      const nextKey = key(next)

      // Always allow stepping onto the goal even if walkability reports it blocked.
      const isGoal = nextKey === goalKey
      if (!isWalkable(next.x, next.y) && !isGoal) continue
      if (canEnter && !canEnter(current.x, current.y, next.x, next.y)) continue

      const tentativeG = scoreOf(gScore, currentKey) + 1
      if (tentativeG >= scoreOf(gScore, nextKey)) continue

      cameFrom.set(nextKey, { previous: currentKey, direction: direction.name })
      positions.set(nextKey, next)
      gScore.set(nextKey, tentativeG)
      fScore.set(nextKey, tentativeG + manhattan(next, goal))
      openSet.add(nextKey)
    }
  }

  return null
}
