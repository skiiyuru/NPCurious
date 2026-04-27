/**
 * If BeliefBase is the agent's memory notebook, this file is the Librarian 
 * that reads it. Other parts of the code (like the pathfinder or planner) 
 * are not allowed to touch the Notebook directly so they don't accidentally 
 * break or overwrite the state. Instead, they ask the Librarian questions.
 * * CORE RESPONSIBILITIES (The Essentials):
 * * 1. TILE QUERIES (Understanding the Ground)
 * - isWalkable / isObstacleAt: Checks if a spot on the map is safe to step on, 
 * or if another player or crate is currently blocking the way.
 * - isDirectionBlocked: Checks if the agent recently bumped into something there.
 * - isDeliveryZone: Confirms if a specific spot is a valid drop-off point.
 * * 2. PARCEL QUERIES (Managing Inventory)
 * - getFreeParcels: Filters the massive list of packages to find only the ones 
 * sitting on the ground waiting to be grabbed.
 * - getCarriedParcels: The agent checking its own pockets to see what it holds.
 * * 3. ZONE QUERIES (Finding Key Locations)
 * - getDeliveryZones / getSpawnTiles: Retrieves the master lists of where 
 * packages appear and where they need to be dropped off.
 * * 4. AGENT QUERIES (Tracking the Competition)
 * - getAgentDistance: Calculates exactly how many steps away another player is.
 * - getVisibleAgents: Returns a list of all other players currently in sight.
 * * 5. MEMORY QUERIES (Exploration & Blacklist)
 * - getVisitCount: Checks how many times the agent has stepped on a tile 
 * (used to prevent the agent from just walking in circles).
 * - isTargetBlacklisted: Checks if a target is on the Do-Not-Disturb list.
 * ============================================================================
 */

export class BeliefQueries {
  /**
   * @param {import("./BeliefBase.js").BeliefBase} beliefBase
   */
  constructor(beliefBase) {
    this._b = beliefBase
  }

  // Tile checker
  /**
   * True if (x, y) is a walkable tile (not a wall, not off-map).
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isWalkable(x, y) {
    const tile = this._b.map.get(`${Math.round(x)},${Math.round(y)}`) // It opens the Notebook's map section and looks for that specific square.
    return !!tile && tile.type !== "0" // If tile exist moveable
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {{ ignoreAgentIds?: string[], includeAgents?: boolean, includeCrates?: boolean }} [options]
   * @returns {boolean}
   */
  // Checking if there is any agent or box in path
  isObstacleAt(x, y, options = {}) {
    const rx = Math.round(x)
    const ry = Math.round(y)
    const ignored = new Set(options.ignoreAgentIds ?? [this._b.me?.id].filter(Boolean))
    const includeAgents = options.includeAgents ?? true
    const includeCrates = options.includeCrates ?? true
    // checks the list of other players nad check if there is obstacle  = TRUE
    if (includeAgents) {
      for (const agent of this._b.agents.values()) {
        if (ignored.has(agent.id)) continue
        if (Math.round(agent.x) === rx && Math.round(agent.y) === ry) return true
      }
    }
    if (includeCrates) {
      for (const crate of this._b.crates.values()) {
        if (Math.round(crate.x) === rx && Math.round(crate.y) === ry) return true
      }
    }

    return false
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} dir
   * @returns {boolean}
   */
  // True if a known blocked-move record exists for the coordinate
  isDirectionBlocked(x, y, dir) {
    return this._b.isDirectionBlocked(x, y, dir)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  // True if coordinates is a delivery zone tile
  isDeliveryZone(x, y) {
    return this._b.deliveryTiles.some(
      (tile) => tile.x === Math.round(x) && tile.y === Math.round(y)
    )
  }

  // Parcels
  /**
   * @returns {any[]}
   */
  // All parcels not currently carried by anyone.
  getFreeParcels() {
    return [...this._b.parcels.values()].filter((p) => !p.carriedBy)
  }

  /**
   * @returns {any[]}
   */
  // All parcels carried by our agent.
  getCarriedParcels() {
    if (!this._b.me) return []
    return [...this._b.parcels.values()].filter(
      (p) => p.carriedBy === this._b.me.id
    )
  }

  // All known delivery zone and spawn tiles.
  /**
   * @returns {{ x: number, y: number }[]}
   */
  getDeliveryZones() {
    return this._b.deliveryTiles
  }
  /**
   * 
   * @returns {{ x: number, y: number }[]}
   */
  getSpawnTiles() {
    return this._b.spawnTiles
  }

  // Calc how far other agents
  // Manhattan distance to a known agent by id. Returns Infinity if unknown.
  /**
   * 
   * @param {string} agentId
   * @returns {number}
   */
  getAgentDistance(agentId) {
    const me = this._b.me
    const agent = this._b.agents.get(agentId)
    if (!me || !agent) return Infinity
    return Math.abs(me.x - agent.x) + Math.abs(me.y - agent.y)
  }

  /**
   * @returns {any[]}
   */
  // All currently visible other agents
  getVisibleAgents() {
    return [...this._b.agents.values()]
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  // How many times has our agent visited tile
  getVisitCount(x, y) {
    return this._b.getVisitCount(x, y)
  }
  // Blacklist (forwarded from BeliefBase)
  isTargetBlacklisted(key) {
    return this._b.isTargetBlacklisted(key)
  }
}
