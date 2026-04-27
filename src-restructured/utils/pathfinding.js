/**
 * This file contains the raw mathematics required to solve the maze of the 
 * game board. It calculates the absolute shortest path between two points 
 * while dodging walls, crates, and other players.
 * * CORE COMPONENTS:
 * * 1. THE SORTER (MinHeap):
 * A highly optimized data structure. When the GPS is guessing which way 
 * to go, it stores millions of possibilities. The MinHeap ensures the 
 * "most promising" guess is always sitting instantly at the very top.
 * * 2. THE MAZE SOLVER (findPath - A* Algorithm):
 * Uses the A* formula to explore the grid. It fans out from the start 
 * point, constantly asking the Librarian ("Is there a wall here?"), and 
 * finds the shortest possible route to the destination.
 * * 3. THE RE-ROUTER (findPathWithFallback):
 * Sometimes another player is temporarily standing in a doorway, making 
 * the math engine think the room is impossible to enter. This function 
 * tries to find a completely clear path first. If it fails, it runs the 
 * math again but ignores other players, assuming they will eventually move.
 * ============================================================================
 */

import { manhattan } from "./distance.js"

// Game coordinate system
const DIRS = Object.freeze([
  [0, 1, "up"],
  [0, -1, "down"],
  [1, 0, "right"],
  [-1, 0, "left"],
])

// MinHeap for A* Queue --> O(log n) 
class MinHeap {
  constructor() {
    this._data = []
  }

  get size() {
    return this._data.length
  }

  /**
   * @param {any} item
   * @param {number} priority
   */
  // Push new item to the bottom of list
  push(item, priority) {
    this._data.push({ item, priority })
    this._bubbleUp(this._data.length - 1) // compare new tile with one above if lower value = higher urgency --> swap
  }
  /**
   * @returns {any}
   */
  // Pop the one with lowest priority value
  pop() {
    const top = this._data[0]
    const last = this._data.pop()
    if (this._data.length > 0) {
      this._data[0] = last
      this._siftDown(0)
    }
    return top.item
  }
  /** @private */
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this._data[parent].priority <= this._data[i].priority) break
      ;[this._data[parent], this._data[i]] = [this._data[i], this._data[parent]]
      i = parent
    }
  }
  /** @private */
  _siftDown(i) {
    const n = this._data.length
    while (true) {
      let smallest = i
      const l = 2 * i + 1
      const r = 2 * i + 2
      if (l < n && this._data[l].priority < this._data[smallest].priority) smallest = l
      if (r < n && this._data[r].priority < this._data[smallest].priority) smallest = r
      if (smallest === i) break
      ;[this._data[smallest], this._data[i]] = [this._data[i], this._data[smallest]]
      i = smallest
    }
  }
}


/**
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {import("../beliefs/queries.js").BeliefQueries} queries
 * @param {{ avoidAgents?: boolean, avoidCrates?: boolean }} [options]
 * @returns {string[] | null}  ordered direction strings, or null if unreachable
 */
// A* formula = f(n) = g(n) + h(n)
// g(n) exact steps from start; h(n) estimated steps to finish
export function findPath(fromX, fromY, toX, toY, queries, options = {}) {
  const sx = Math.round(fromX)
  const sy = Math.round(fromY)
  const ex = Math.round(toX)
  const ey = Math.round(toY)
  const avoidAgents = options.avoidAgents ?? true
  const avoidCrates = options.avoidCrates ?? true

  if (sx === ex && sy === ey) return []

  const parent = new Map() // Trail of path
  const g = new Map() // step counter
  const startKey = `${sx},${sy}`
  parent.set(startKey, null)
  g.set(startKey, 0)

  const open = new MinHeap() //Where we use minheap
  open.push({ x: sx, y: sy, key: startKey }, manhattan(sx, sy, ex, ey))

  while (open.size > 0) { // Loop until tile finish
    const { x: cx, y: cy, key: curKey } = open.pop()

    const curG = g.get(curKey)
    if (curG === undefined) continue
    if (cx === ex && cy === ey) { // if tile = target drawline bacwarkds 
      return _reconstructPath(parent, curKey)
    }
    //check if agetns being block, tile are not walkable, etc
    for (const [dx, dy, dir] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      const key = `${nx},${ny}`
      if (queries.isDirectionBlocked(cx, cy, dir)) continue 
      if (!queries.isWalkable(nx, ny)) continue
      if (
        queries.isObstacleAt(nx, ny, {
          includeAgents: avoidAgents,
          includeCrates: avoidCrates,
        })
      ) continue

      const tentativeG = curG + 1
      const existingG = g.get(key)
      if (existingG !== undefined && tentativeG >= existingG) continue

      g.set(key, tentativeG)
      parent.set(key, { parentKey: curKey, dir })
      const h = manhattan(nx, ny, ex, ey)
      open.push({ x: nx, y: ny, key }, tentativeG + h)
    }
  }

  return null
}

/**
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {import("../beliefs/queries.js").BeliefQueries} queries
 * @returns {string[] | null}
 */
// Agent will move bny the path and if its fail
export function findPathWithFallback(fromX, fromY, toX, toY, queries) {
  const preferred = findPath(fromX, fromY, toX, toY, queries, {
    avoidAgents: true,
    avoidCrates: true,
  })
  // It will treat other agent non exist (other agent wont stay still)
  if (preferred !== null) return preferred

  return findPath(fromX, fromY, toX, toY, queries, {
    avoidAgents: false,
    avoidCrates: true,
  })
}

/** @private */
//  Following parentkey until got the starting tile and reverse it to get proper direction
function _reconstructPath(parent, goalKey) {
  const dirs = []
  let current = goalKey
  while (parent.get(current) !== null) {
    const { parentKey, dir } = parent.get(current)
    dirs.push(dir)
    current = parentKey
  }
  dirs.reverse()
  return dirs
}
