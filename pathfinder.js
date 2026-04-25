// Direction of th[e game]
// Game coordinate system: right=x+1, left=x-1, up=y+1, down=y-1
const DIRS = Object.freeze([
  [0, 1, "up"],
  [0, -1, "down"],
  [1, 0, "right"],
  [-1, 0, "left"],
])

/**
 * A* needs to processs node that looks promising for the next step.
 * Thus we can implement priority queue (MinHeap) that gives lowes priority in O(log n) time.
 * This can scip whole list to find the best node (much more efficient for bigger map)
 */
class MinHeap {
  constructor() {
    this._data = []
  }
  get size() {
    return this._data.length
  }

  // When new route gettingp ush we push it as item at the end of list. 
  // New route will push to top if has lower number than others
  push(item, priority) {
    this._data.push({ item, priority })
    this._bubbleUp(this._data.length - 1)
  }
  // After opoing best option we put route from bottom list to top list. This is way faster then uprank every route one by one
  pop() {
    const top = this._data[0]
    const last = this._data.pop()
    if (this._data.length > 0) {
      this._data[0] = last
      this._siftDown(0)
    }
    return top.item
  }
  // This part calculates parent of current item if parent has lower score we stop if current item have better scores it swap. 
  // This is where we "re arrange" or list for the best option.
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this._data[parent].priority <= this._data[i].priority) break
      ;[this._data[parent], this._data[i]] = [this._data[i], this._data[parent]]
      i = parent
    }
  }

  // Check L&R  childrens if if it is better then swap. Continue downward  
  _siftDown(i) {
    const n = this._data.length
    while (true) {
      let smallest = i
      const l = 2 * i + 1
      const r = 2 * i + 2
      if (l < n && this._data[l].priority < this._data[smallest].priority)
        smallest = l
      if (r < n && this._data[r].priority < this._data[smallest].priority)
        smallest = r
      if (smallest === i) break
      ;[this._data[smallest], this._data[i]] = [
        this._data[i],
        this._data[smallest],
      ]
      i = smallest
    }
  }
}

export class Pathfinder {
  /** @param {import("./beliefs.js").BeliefBase} beliefs */
  constructor(beliefs) {
    this.beliefs = beliefs
  }
// This method use Manhattan distance as the optimal route direction.
// This will make exploration less fewer nodes.
// The minheap logic will set open set and a parent map rather than updating each single step that taken.
  manhattan(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2)
  }

  /**
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} toX
   * @param {number} toY
   * @param {{avoidAgents?: boolean, avoidCrates?: boolean}} options
   * @returns {string[]|null}
   */
  // This part fixing the agent if moving out of track even slightly
  findPath(fromX, fromY, toX, toY, options = {}) {
    const sx = Math.round(fromX)
    const sy = Math.round(fromY)
    const ex = Math.round(toX)
    const ey = Math.round(toY)
    // Avoiding blockers and check if already at destinations
    const avoidAgents = options.avoidAgents ?? true
    const avoidCrates = options.avoidCrates ?? true
    if (sx === ex && sy === ey) return []

    // This will create new tracks 
    // Parent the path where we get the parclet (A->B->C->GOAL)
    // G = how many steps to get there (cost of A*)
    const parent = new Map()
    const g = new Map()
    const startKey = `${sx},${sy}`
    parent.set(startKey, null) // no parent = 0 steps
    g.set(startKey, 0)

    // Push start node with priority f = g + h = - + manhattan. Return lowest node with f scores (next to be explored)
    const open = new MinHeap()
    open.push({ x: sx, y: sy, key: startKey }, this.manhattan(sx, sy, ex, ey))

    // This will loop as long we have routes to check. Each iterations will pope best node.
    while (open.size > 0) {
      const { x: cx, y: cy, key: curKey } = open.pop()

      // We Never update or remove item in heap (Much faster if we dont loop into the heap). Multiple node can appear thus we cheked the g that has low value to pop first 
      const curG = g.get(curKey)
      if (curG === undefined) continue

      if (cx === ex && cy === ey) {
        return this._reconstructPath(parent, curKey)
      }
      // Trying all neighbors at curent tile. 
      for (const [dx, dy, dir] of DIRS) {
        const nx = cx + dx
        const ny = cy + dy
        const key = `${nx},${ny}`

        if (this.beliefs.isDirectionBlocked(cx, cy, dir)) continue
        if (!this.beliefs.isWalkable(nx, ny)) continue // Check if tile is not wall or off map
        if ( // check if tile occupied by other agent or crate
          this.beliefs.isOccupied(nx, ny, {
            ignoreAgentIds: [this.beliefs.me?.id].filter(Boolean),
            includeAgents: avoidAgents,
            includeCrates: avoidCrates,
          })
        ) {
          continue
        }

        // How many steps it would take to reach the neighbor based on the current path.
        const tentativeG = curG + 1
        const existingG = g.get(key)
        if (existingG !== undefined && tentativeG >= existingG) continue

        // Better path found to the neighbor. Store the cost and 
        g.set(key, tentativeG)
        parent.set(key, { parentKey: curKey, dir })
        // Heuristic calculation for distance of neighbor to goal.
        const h = this.manhattan(nx, ny, ex, ey)
        open.push({ x: nx, y: ny, key }, tentativeG + h)
      }
    }

    return null
  }

  /**
   * @private
   */
  _reconstructPath(parent, goalKey) {
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

  /**
   * @param {number} fromX
   * @param {number} fromY
   * @returns {{x:number,y:number,dist:number}|null}
   */
  nearestDelivery(fromX, fromY) {
    if (!this.beliefs.deliveryTiles.length) return null

    let best = null
    for (const tile of this.beliefs.deliveryTiles) {
      const path = this.findPath(fromX, fromY, tile.x, tile.y, {
        avoidAgents: false,
        avoidCrates: false,
      })
      if (path === null) continue
      const dist = path.length
      if (!best || dist < best.dist) {
        best = { ...tile, dist }
      }
    }

    // If no paths found (map not loaded yet), fall back to Manhattan
    if (!best) {
      for (const tile of this.beliefs.deliveryTiles) {
        const dist = this.manhattan(fromX, fromY, tile.x, tile.y)
        if (!best || dist < best.dist) {
          best = { ...tile, dist }
        }
      }
    }

    return best
  }

  /**
   * @param {number} fromX
   * @param {number} fromY
   * @returns {{x:number,y:number,dist:number}|null}
   */
  farthestSpawnTile(fromX, fromY) {
    if (!this.beliefs.spawnTiles.length) return null

    let best = null
    for (const tile of this.beliefs.spawnTiles) {
      const dist = this.manhattan(fromX, fromY, tile.x, tile.y)
      if (!best || dist > best.dist) {
        best = { ...tile, dist }
      }
    }

    return best
  }

  /**
   * @param {number} fromX
   * @param {number} fromY
   * @param {{x:number,y:number}|null} currentTarget
   * @param {(tile:{x:number,y:number}) => boolean} shouldSkipTile
   * @returns {{x:number,y:number,dist:number}|null}
   */
  nextExplorationTarget(
    fromX,
    fromY,
    currentTarget = null,
    shouldSkipTile = () => false
  ) {
    const spawnTarget = this.spawnSearchTarget(
      fromX,
      fromY,
      currentTarget,
      shouldSkipTile
    )
    if (spawnTarget) return spawnTarget

    const frontier = this.frontierExplorationTarget(
      fromX,
      fromY,
      currentTarget,
      shouldSkipTile
    )
    if (frontier) return frontier

    const reachableSpawn = this._farthestReachableTile(
      this.beliefs.spawnTiles,
      fromX,
      fromY,
      currentTarget,
      shouldSkipTile
    )
    if (reachableSpawn) return reachableSpawn

    const walkableTiles = [...this.beliefs.map.values()]
      .filter((tile) => tile.type !== "0")
      .map((tile) => ({ x: tile.x, y: tile.y }))

    return this._farthestReachableTile(
      walkableTiles,
      fromX,
      fromY,
      currentTarget,
      shouldSkipTile
    )
  }

  spawnSearchTarget(
    fromX,
    fromY,
    currentTarget = null,
    shouldSkipTile = () => false
  ) {
    if (this.beliefs.spawnTiles.length === 0) return null

    const unseenSpawn = this._bestReachableTileByScore(
      this.beliefs.spawnTiles.filter(
        (tile) => this.beliefs.getVisitCount(tile.x, tile.y) === 0
      ),
      fromX,
      fromY,
      currentTarget,
      shouldSkipTile,
      (_tile, pathLen) => pathLen
    )
    if (unseenSpawn) return unseenSpawn

    return this._bestReachableTileByScore(
      this.beliefs.spawnTiles,
      fromX,
      fromY,
      currentTarget,
      shouldSkipTile,
      (tile, pathLen) => {
        const visits = this.beliefs.getVisitCount(tile.x, tile.y)
        const distancePenalty = this.manhattan(fromX, fromY, tile.x, tile.y)
        return visits * 100 + pathLen + distancePenalty
      }
    )
  }

  frontierExplorationTarget(
    fromX,
    fromY,
    currentTarget = null,
    shouldSkipTile = () => false
  ) {
    const walkableTiles = [...this.beliefs.map.values()].filter(
      (tile) => tile.type !== "0"
    )

    const frontierTiles = walkableTiles.filter((tile) => {
      if (this.beliefs.getVisitCount(tile.x, tile.y) > 0) return false

      for (const [dx, dy] of DIRS) {
        if (this.beliefs.getVisitCount(tile.x + dx, tile.y + dy) > 0) {
          return true
        }
      }

      return false
    })

    const isSpawn = (tile) =>
      this.beliefs.spawnTiles.some(
        (spawn) => spawn.x === tile.x && spawn.y === tile.y
      )

    const bestFrontier = this._bestReachableTileByScore(
      frontierTiles,
      fromX,
      fromY,
      currentTarget,
      shouldSkipTile,
      (tile, pathLen) => pathLen + (isSpawn(tile) ? -1 : 0)
    )
    if (bestFrontier) return bestFrontier

    return this._bestReachableTileByScore(
      walkableTiles,
      fromX,
      fromY,
      currentTarget,
      shouldSkipTile,
      (tile, pathLen) =>
        pathLen + this.beliefs.getVisitCount(tile.x, tile.y) * 4
    )
  }

  /**
   * Pick the best adjacent exploration move using local visit counts first.
   *
   * @param {number} fromX
   * @param {number} fromY
   * @returns {{x:number,y:number,dir:string}|null}
   */
  bestExplorationStep(fromX, fromY) {
    const sx = Math.round(fromX)
    const sy = Math.round(fromY)
    let best = null

    for (const [dx, dy, dir] of DIRS) {
      const nx = sx + dx
      const ny = sy + dy

      if (this.beliefs.isDirectionBlocked(sx, sy, dir)) continue
      if (!this.beliefs.isWalkable(nx, ny)) continue
      if (
        this.beliefs.isOccupied(nx, ny, {
          ignoreAgentIds: [this.beliefs.me?.id].filter(Boolean),
        })
      ) {
        continue
      }

      const visits = this.beliefs.getVisitCount(nx, ny)
      if (visits > 0) continue

      const isSpawn = this.beliefs.spawnTiles.some(
        (tile) => tile.x === nx && tile.y === ny
      )
      const score = isSpawn ? -3 : 0

      if (!best || score < best.score) {
        best = { x: nx, y: ny, dir, score }
      }
    }

    return best ? { x: best.x, y: best.y, dir: best.dir } : null
  }

  _farthestReachableTile(
    tiles,
    fromX,
    fromY,
    currentTarget = null,
    shouldSkipTile = () => false
  ) {
    let best = null

    for (const tile of tiles) {
      if (this._isCurrentPos(tile, fromX, fromY)) continue
      if (currentTarget && this._isSameTile(tile, currentTarget)) continue
      if (shouldSkipTile(tile)) continue

      const path = this.findPath(fromX, fromY, tile.x, tile.y)
      if (!path || path.length === 0) continue

      if (!best || path.length > best.dist) {
        best = { ...tile, dist: path.length }
      }
    }

    return best
  }

  /**
   * Pick the tile with the lowest score according to scoreFn.
   * Skips the current position, the current target, and anything shouldSkipTile rejects.
   *
   * @param {any[]} tiles
   * @param {number} fromX
   * @param {number} fromY
   * @param {{x:number,y:number}|null} currentTarget
   * @param {(tile:any) => boolean} shouldSkipTile
   * @param {(tile:any, pathLen:number) => number} scoreFn   lower = better
   * @returns {{x:number,y:number,dist:number}|null}
   */
  _bestReachableTileByScore(
    tiles,
    fromX,
    fromY,
    currentTarget = null,
    shouldSkipTile = () => false,
    scoreFn = (_tile, pathLen) => pathLen
  ) {
    let best = null

    for (const tile of tiles) {
      if (this._isCurrentPos(tile, fromX, fromY)) continue
      if (currentTarget && this._isSameTile(tile, currentTarget)) continue
      if (shouldSkipTile(tile)) continue

      const path = this.findPath(fromX, fromY, tile.x, tile.y)
      if (!path) continue

      const score = scoreFn(tile, path.length)
      if (!best || score < best.score) {
        best = { ...tile, dist: path.length, score }
      }
    }

    return best
  }

  /** @private */
  _isCurrentPos(tile, fromX, fromY) {
    return (
      Math.round(tile.x) === Math.round(fromX) &&
      Math.round(tile.y) === Math.round(fromY)
    )
  }

  /** @private */
  _isSameTile(a, b) {
    return (
      Math.round(a.x) === Math.round(b.x) &&
      Math.round(a.y) === Math.round(b.y)
    )
  }
} 