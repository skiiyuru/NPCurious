const DEFAULT_BLOCKED_MOVE_TTL_MS = 1000 //Block direction for 1 second

/**
 * @param {string | number} type
 * @returns {string}
 */
function normalizeTileType(type) {
  return String(type)
}

export class BeliefBase {
  constructor() {
    /** @type {Map<string, {x:number,y:number,type:string}>} */
    this.map = new Map() // storing map from server

    /** @type {{x:number,y:number}[]} */
    this.deliveryTiles = []

    /** @type {{x:number,y:number}[]} */
    this.spawnTiles = []

    /**
     * @type {Map<string, {
     *   id:string,
     *   x:number,
     *   y:number,
     *   reward:number,
     *   carriedBy?:string,
     *   lastSeen:number,
     *   baseReward:number
     * }>}
     */
    // Getting all info about the map. Where and who got the parcels, visible agent position, crates, our position.
    this.parcels = new Map()

    /** @type {Map<string, {id:string,name:string,x:number,y:number,score:number,lastSeen:number}>} */
    this.agents = new Map()

    /** @type {Map<string, {id:string,x:number,y:number,lastSeen:number}>} */
    this.crates = new Map()

    /** @type {{id:string,name:string,x:number,y:number,score:number}|null} */
    this.me = null

    /** @type {any} */
    this.config = null

    this.mapWidth = 0
    this.mapHeight = 0
    this.observationDistance = 5
    this.decayIntervalMs = Infinity
    this.movementDurationMs = 50
    this.blockedMoveTtlMs = DEFAULT_BLOCKED_MOVE_TTL_MS
    this.blockedMoves = new Map()
    this.visits = new Map()
    this.targetBlacklist = new Map()
    this.positions = []
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {{x:number,y:number,type:string|number}[]} tiles
   */
  // Full reset map if new map received
  updateMap(width, height, tiles) {
    this.mapWidth = width
    this.mapHeight = height
    this.map.clear()
    this.deliveryTiles = []
    this.spawnTiles = []

    // Each tile identified by key thus we save time by not filtering whole map.
    for (const tile of tiles) {
      const normalizedTile = {
        ...tile,
        type: normalizeTileType(tile.type),
      }

      this.map.set(`${tile.x},${tile.y}`, normalizedTile)
      if (normalizedTile.type === "2") { //delivery
        this.deliveryTiles.push({ x: tile.x, y: tile.y })
      }
      if (normalizedTile.type === "1") { //spawn
        this.spawnTiles.push({ x: tile.x, y: tile.y })
      }
    }

    console.log(
      `[Beliefs] Map: ${width}x${height} | delivery=${this.deliveryTiles.length} spawn=${this.spawnTiles.length}`
    )
  }

  /** @param {any} config */
  updateConfig(config) {
    this.config = config

    const player = config?.GAME?.player
    const parcels = config?.GAME?.parcels
    // Movement duration config based on DEFAULT_BLOCKED_MOVE_TTL_MS
    if (player?.movement_duration) {
      this.movementDurationMs = player.movement_duration
      this.blockedMoveTtlMs = Math.max(
        DEFAULT_BLOCKED_MOVE_TTL_MS,
        this.movementDurationMs * 8
      )
    }
    if (player?.observation_distance) {
      this.observationDistance = player.observation_distance
    }
    if (parcels?.decaying_event?.ms) { //parcel decays
      this.decayIntervalMs = parcels.decaying_event.ms
    }

    console.log(
      `[Beliefs] Config | move=${this.movementDurationMs}ms decay=${this.decayIntervalMs}ms obs=${this.observationDistance}`
    )
  }

  // Update from server for our position and values whether it changed a lot or not to do re-deliberation.
  /** @param {{id:string,name:string,x:number,y:number,score:number}} agent */
  updateMe(agent) {
    this.me = agent
    this.noteVisit(agent.x, agent.y)
  }

  /**
   * @param {{agents: any[], parcels: any[], positions?: any[]}} sensing
   * @returns {{ newParcels: boolean, parcelGone: boolean, parcelChanged: boolean }}
   */
  updateSensing(sensing) {
    const now = Date.now()
    let newParcels = false
    let parcelGone = false
    let parcelChanged = false

    this.agents.clear()
    for (const agent of sensing.agents ?? []) {
      this.agents.set(agent.id, { ...agent, lastSeen: now })
    }

    this.crates.clear()
    for (const crate of sensing.crates ?? []) {
      this.crates.set(crate.id, { ...crate, lastSeen: now })
    }

    this.positions = [...(sensing.positions ?? [])]

    // Compare parcels update with known knowledge. If new flagged. Save reward before decay starts and will be estimated by estimateReward
    const seenParcelIds = new Set()
    for (const parcel of sensing.parcels ?? []) {
      seenParcelIds.add(parcel.id)
      const existing = this.parcels.get(parcel.id)

      if (!existing) {
        newParcels = true
      } else if (
        existing.x !== parcel.x ||
        existing.y !== parcel.y ||
        existing.reward !== parcel.reward ||
        (existing.carriedBy ?? null) !== (parcel.carriedBy ?? null)
      ) {
        parcelChanged = true
      }

      this.parcels.set(parcel.id, {
        ...parcel,
        lastSeen: now,
        baseReward: parcel.reward,
      })
    }
    // Removes stale parcels from memory to prevent the agent from tracking vanished or delivered parcels.
    if (this.me) {
      const mx = Math.round(this.me.x)
      const my = Math.round(this.me.y)

      for (const [id, parcel] of this.parcels) {
        if (seenParcelIds.has(id)) continue
        if (parcel.carriedBy === this.me.id) {
          if (this.isDeliveryTile(mx, my)) {
            this.parcels.delete(id)
            parcelGone = true
          }
          continue
        }

        const dist = Math.abs(parcel.x - mx) + Math.abs(parcel.y - my)
        if (dist < this.observationDistance) {
          this.parcels.delete(id)
          parcelGone = true
        }
      }
    }

    return { newParcels, parcelGone, parcelChanged }
  }

  // Estimating current parcel value by the time we saw it.
  /** @param {{reward?:number,baseReward?:number,lastSeen:number}} parcel */
  estimateReward(parcel) {
    if (this.decayIntervalMs === Infinity) {
      return parcel.reward ?? parcel.baseReward ?? 0
    }

    const baseReward = parcel.baseReward ?? parcel.reward ?? 0
    const elapsed = Date.now() - parcel.lastSeen
    const decayed = Math.floor(elapsed / this.decayIntervalMs)
    return Math.max(0, baseReward - decayed)
  }

  /**
   * @param {{reward?:number,baseReward?:number,lastSeen:number}} parcel
   * @param {number} stepsAway
   */
  // Calculating parcel value on delivery
  estimateRewardOnArrival(parcel, stepsAway) {
    const baseReward = parcel.baseReward ?? parcel.reward ?? 0
    if (this.decayIntervalMs === Infinity) return baseReward

    const travelMs = stepsAway * this.movementDurationMs
    const totalMs = (Date.now() - parcel.lastSeen) + travelMs
    const decayed = Math.floor(totalMs / this.decayIntervalMs)
    return Math.max(0, baseReward - decayed)
  }

  getFreeParcels() {
    return [...this.parcels.values()].filter((parcel) => !parcel.carriedBy)
  }

  getCarriedParcels() {
    if (!this.me) return []
    return [...this.parcels.values()].filter(
      (parcel) => parcel.carriedBy === this.me.id
    )
  }

  // Tile type "0" = not walkable
  /** @param {number} x @param {number} y */
  isWalkable(x, y) {
    const tile = this.map.get(`${Math.round(x)},${Math.round(y)}`)
    return !!tile && tile.type !== "0"
  }

  // Checks if a coordinate matches any known delivery tile
  /** @param {number} x @param {number} y */
  isDeliveryTile(x, y) {
    return this.deliveryTiles.some(
      (tile) => tile.x === Math.round(x) && tile.y === Math.round(y)
    )
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {{ignoreAgentIds?: string[], includeAgents?: boolean, includeCrates?: boolean}} options
   */
  // Check block by crates or agent
  isOccupied(x, y, options = {}) {
    const rx = Math.round(x)
    const ry = Math.round(y)
    const ignored = new Set(options.ignoreAgentIds ?? []) // ignoring our own id
    const includeAgents = options.includeAgents ?? true
    const includeCrates = options.includeCrates ?? true

    if (includeAgents) {
      for (const agent of this.agents.values()) {
        if (ignored.has(agent.id)) continue
        if (Math.round(agent.x) === rx && Math.round(agent.y) === ry) {
          return true
        }
      }
    }

    if (includeCrates) {
      for (const crate of this.crates.values()) {
        if (Math.round(crate.x) === rx && Math.round(crate.y) === ry) {
          return true
        }
      }
    }

    return false
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} dir
   */
  // Marking tiles that block when agent tries to move from specific direction.
  // Timer resets if bumped again.
  markMoveBlocked(x, y, dir) {
    const key = `${Math.round(x)},${Math.round(y)}`
    const blocked = this.blockedMoves.get(key) ?? new Map()
    blocked.set(dir, Date.now() + this.blockedMoveTtlMs)
    this.blockedMoves.set(key, blocked)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} dir
   */
  // Clear block mark if it succeeds at the end
  clearBlockedMove(x, y, dir) {
    const key = `${Math.round(x)},${Math.round(y)}`
    const blocked = this.blockedMoves.get(key)
    if (!blocked) return

    blocked.delete(dir)
    if (blocked.size === 0) {
      this.blockedMoves.delete(key)
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} dir
   */
  // Block mark checker with lazy TTL expiry
  isDirectionBlocked(x, y, dir) {
    const key = `${Math.round(x)},${Math.round(y)}`
    const blocked = this.blockedMoves.get(key)
    if (!blocked) return false

    const now = Date.now()
    const expired = []

    for (const [blockedDir, expiresAt] of blocked) {
      if (expiresAt <= now) {
        expired.push(blockedDir)
        continue
      }
      if (blockedDir === dir) {
        for (const e of expired) blocked.delete(e)
        if (blocked.size === 0) this.blockedMoves.delete(key)
        return true
      }
    }

    for (const e of expired) blocked.delete(e)
    if (blocked.size === 0) this.blockedMoves.delete(key)
    return false
  }

  noteVisit(x, y) {
    const key = `${Math.round(x)},${Math.round(y)}`
    this.visits.set(key, (this.visits.get(key) ?? 0) + 1)
  }

  getVisitCount(x, y) {
    return this.visits.get(`${Math.round(x)},${Math.round(y)}`) ?? 0
  }

  blacklistTarget(key, ttlMs) {
    this.targetBlacklist.set(key, Date.now() + ttlMs)
  }

  isTargetBlacklisted(key) {
    const expiresAt = this.targetBlacklist.get(key)
    if (expiresAt === undefined) return false
    if (Date.now() >= expiresAt) {
      this.targetBlacklist.delete(key)
      return false
    }
    return true
  }

  pruneBlacklistedTargets() {
    const now = Date.now()
    for (const [key, expiresAt] of this.targetBlacklist) {
      if (now >= expiresAt) this.targetBlacklist.delete(key)
    }
  }
}
