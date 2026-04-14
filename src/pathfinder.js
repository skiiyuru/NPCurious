// Direction offsets: [dx, dy, name]
// Game coordinate system: right=x+1, left=x-1, up=y+1, down=y-1
const DIRS = Object.freeze([
  [0, 1, "up"],
  [0, -1, "down"],
  [1, 0, "right"],
  [-1, 0, "left"],
])

export class Pathfinder {
  /** @param {import("./beliefs.js").BeliefBase} beliefs */
  constructor(beliefs) {
    this.beliefs = beliefs
  }

  manhattan(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2)
  }

  /**
   * BFS using parent-pointer reconstruction — O(V) time and space, no
   * per-node path array copies, no O(n) queue.shift().
   *
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} toX
   * @param {number} toY
   * @param {{avoidAgents?: boolean, avoidCrates?: boolean}} options
   * @returns {string[]|null}
   */
  findPath(fromX, fromY, toX, toY, options = {}) {
    const sx = Math.round(fromX)
    const sy = Math.round(fromY)
    const ex = Math.round(toX)
    const ey = Math.round(toY)
    const avoidAgents = options.avoidAgents ?? true
    const avoidCrates = options.avoidCrates ?? true

    if (sx === ex && sy === ey) return []

    // parent[key] = { key: parentKey, dir: directionTaken }
    const parent = new Map()
    const startKey = `${sx},${sy}`
    parent.set(startKey, null)

    // Use an array as a FIFO queue with a head pointer — O(1) dequeue
    const queue = [{ x: sx, y: sy }]
    let head = 0

    while (head < queue.length) {
      const { x: cx, y: cy } = queue[head++]
      const curKey = `${cx},${cy}`

      for (const [dx, dy, dir] of DIRS) {
        const nx = cx + dx
        const ny = cy + dy
        const key = `${nx},${ny}`

        if (parent.has(key)) continue
        if (this.beliefs.isDirectionBlocked(cx, cy, dir)) continue
        if (!this.beliefs.isWalkable(nx, ny)) continue
        if (
          this.beliefs.isOccupied(nx, ny, {
            ignoreAgentIds: [this.beliefs.me?.id].filter(Boolean),
            includeAgents: avoidAgents,
            includeCrates: avoidCrates,
          })
        ) {
          continue
        }

        parent.set(key, { parentKey: curKey, dir })

        if (nx === ex && ny === ey) {
          return this._reconstructPath(parent, key)
        }

        queue.push({ x: nx, y: ny })
      }
    }

    return null
  }

  /**
   * Reconstruct a direction sequence from the BFS parent map.
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
   * Nearest delivery tile by actual path length (not Manhattan), with
   * an optional fallback to Manhattan if no path is found (open area).
   *
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
        best = { x: tile.x, y: tile.y, dist: path.length }
      }
    }

    return best
  }

  _bestReachableTileByScore(
    tiles,
    fromX,
    fromY,
    currentTarget,
    shouldSkipTile,
    scoreTile
  ) {
    let best = null

    for (const tile of tiles) {
      if (this._isCurrentPos(tile, fromX, fromY)) continue
      if (currentTarget && this._isSameTile(tile, currentTarget)) continue
      if (shouldSkipTile(tile)) continue

      const path = this.findPath(fromX, fromY, tile.x, tile.y)
      if (!path || path.length === 0) continue

      const score = scoreTile(tile, path.length)
      if (!best || score < best.score) {
        best = { x: tile.x, y: tile.y, dist: path.length, score }
      }
    }

    return best ? { x: best.x, y: best.y, dist: best.dist } : null
  }

  _isCurrentPos(tile, fromX, fromY) {
    return (
      Math.round(tile.x) === Math.round(fromX) &&
      Math.round(tile.y) === Math.round(fromY)
    )
  }

  _isSameTile(a, b) {
    return (
      Math.round(a.x) === Math.round(b.x) &&
      Math.round(a.y) === Math.round(b.y)
    )
  }
}
