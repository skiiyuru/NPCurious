/**
 * Build a STRIPS problem for navigating start → goal over the current belief map.
 * Walkable tiles = cells; move-dir facts use right:x+1, left:x-1, up:y+1, down:y-1.
 */

/** @typedef {import('../../types.js').Position} Position */
/** @typedef {import('../../types.js').Beliefs} Beliefs */

const DELTAS = [
  { dir: "right", dx: 1, dy: 0 },
  { dir: "left", dx: -1, dy: 0 },
  { dir: "up", dx: 0, dy: 1 },
  { dir: "down", dx: 0, dy: -1 },
]

/**
 * PDDL object name for a cell, e.g. (3, 5) → "c3_5".
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
export function cellName(x, y) {
  return `c${x}_${y}`
}

/**
 * All non-wall tiles plus start and goal (ensures problem is always well-formed).
 * @param {Beliefs} beliefs
 * @param {Position} start
 * @param {Position} goal
 * @returns {Map<string, Position>} cell name → coordinates.
 */
function collectCells(beliefs, start, goal) {
  /** @type {Map<string, Position>} */
  const cells = new Map()
  for (const tile of beliefs.tiles.values()) {
    if (tile.type === "0" || tile.x === undefined || tile.y === undefined)
      continue
    cells.set(cellName(tile.x, tile.y), { x: tile.x, y: tile.y })
  }
  cells.set(cellName(start.x, start.y), { x: start.x, y: start.y })
  cells.set(cellName(goal.x, goal.y), { x: goal.x, y: goal.y })
  return cells
}

/**
 * Directional adjacency facts. Edge emitted only when destination is walkable and one-way rule permits.
 * Source not checked — agent can always step off its current tile.
 * @param {Beliefs} beliefs
 * @param {Map<string, Position>} cells
 * @returns {string[]}
 */
function buildMoveFacts(beliefs, cells) {
  const moveFacts = []
  for (const { x, y } of cells.values()) {
    for (const { dir, dx, dy } of DELTAS) {
      const nx = x + dx
      const ny = y + dy
      const neighbor = cellName(nx, ny)

      if (!cells.has(neighbor)) continue
      if (!beliefs.isWalkable(nx, ny)) continue
      if (!beliefs.canEnterFrom(x, y, nx, ny)) continue

      moveFacts.push(`(move-dir ${cellName(x, y)} ${neighbor} ${dir})`)
    }
  }
  return moveFacts
}

/**
 * Full PDDL problem string for a navigation task.
 * @param {Beliefs} beliefs
 * @param {Position} start
 * @param {Position} goal
 * @returns {string}
 */
export function buildProblem(beliefs, start, goal) {
  const cells = collectCells(beliefs, start, goal)
  const moveFacts = buildMoveFacts(beliefs, cells)

  const objects = [...cells.keys()].join(" ")
  const init = [`(at ${cellName(start.x, start.y)})`, ...moveFacts].join(
    "\n    "
  )

  return `(define (problem deliveroo-nav)
  (:domain deliveroo-grid)
  (:objects
    ${objects} - cell
    right left up down - direction)
  (:init
    ${init})
  (:goal (at ${cellName(goal.x, goal.y)})))`
}
