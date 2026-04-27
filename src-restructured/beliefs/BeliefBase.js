/**
 * * This class acts as the central memory for our delivery agent. It tracks 
 * everything the agent needs to know to navigate the grid, find packages, 
 * and avoid making silly mistakes.
 * 
 * 1. THE SETUP (The Blank Notebook)
 * When initialized, it prepares empty lists to track the map layout, 
 * other players (agents), packages (parcels), obstacles (crates), 
 * and its own current status.
 * * 2. LEARNING THE RULES & THE BOARD
 * - updateMap / updateConfig: Acts as the agent reading the game rules. 
 * It memorizes spawn points, delivery zones, its own walking speed, 
 * vision radius, and how fast packages lose value.
 * * 3. USING ITS EYES (Sensing the World)
 * - updateSensing: Every time the game updates, the agent looks at what 
 * is currently visible. It adds new packages to its notebook, updates 
 * who is holding what, and crosses out packages that disappeared 
 * (whether stolen, expired, or successfully delivered).
 * * 4. DOING THE MATH (Reward Estimation)
 * - estimateReward: Because packages lose value over time, the agent uses 
 * this to calculate exactly how much a package will be worth by the time 
 * it actually walks over to it.
 * * 5. LEARNING FROM MISTAKES (Memory & Navigation)
 * - Blocked Moves: If it bumps into a wall or player, it remembers that 
 * direction is blocked for 1 second so it doesn't keep hitting it.
 * - Visit Tracking: Leaves a mental breadcrumb trail to ensure it isn't 
 * just walking in circles.
 * - Target Blacklist: Temporarily ignores certain packages (like ones 
 * that are too far away or already taken) to save brainpower.
 */

// IMPORT AND SETUP //
import { BeliefEvents } from "./events.js"
import { estimateReward, estimateRewardOnArrival } from "./revision.js"

const DEFAULT_BLOCKED_MOVE_TTL_MS = 1000

/** @param {string | number} type */
function normalizeTileType(type) {
  return String(type)
}

// Blank state for the agent memory. 
export class BeliefBase {
  constructor() {
    /** @type {Map<string, { x:number, y:number, type:string }>} */
    this.map = new Map() // Dictionary of map tile data

    /** @type {{ x:number, y:number }[]} */
    this.deliveryTiles = [] // Drop zone

    /** @type {{ x:number, y:number }[]} */
    this.spawnTiles = []

    /**
     * @type {Map<string, {
     *   id: string, x: number, y: number,
     *   reward: number, carriedBy?: string,
     *   lastSeen: number, baseReward: number
     * }>}
     */
    this.parcels = new Map()

    /** @type {Map<string, { id:string, name:string, x:number, y:number, score:number, lastSeen:number }>} */
    this.agents = new Map()

    /** @type {Map<string, { id:string, x:number, y:number, lastSeen:number }>} */
    this.crates = new Map()

    /** @type {{ id:string, name:string, x:number, y:number, score:number } | null} */
    this.me = null

    /** @type {any} */
    this.config = null // Holding the agent position, score and, ID
      // Memory for map size, agent visibility, decaying time, and move to take
    this.mapWidth = 0
    this.mapHeight = 0
    this.observationDistance = 5
    this.decayIntervalMs = Infinity
    this.movementDurationMs = 50
      // failed movement memory and tries 
    this.blockedMoveTtlMs = DEFAULT_BLOCKED_MOVE_TTL_MS
    /** @type {Map<string, Map<string, number>>} */
    this.blockedMoves = new Map()
    /** @type {Map<string, number>} */
    this.visits = new Map()
    /** @type {Map<string, number>} */
    this.targetBlacklist = new Map()

    /** @type {any[]} */
    this.positions = []

    /** Semantic event bus — subscribe via beliefs.events.on(...) */
    this.events = new BeliefEvents()
  }
  // Map and config
  // This is where we updating the map and config of the game
  // Gonna be usefull if map changes

  /**
   * @param {number} width
   * @param {number} height
   * @param {{ x:number, y:number, type:string|number }[]} tiles
   */
  updateMap(width, height, tiles) {
    this.mapWidth = width
    this.mapHeight = height
    this.map.clear()
    this.deliveryTiles = []
    this.spawnTiles = []

    for (const tile of tiles) {
      const normalizedTile = { ...tile, type: normalizeTileType(tile.type) }
      this.map.set(`${tile.x},${tile.y}`, normalizedTile)
      if (normalizedTile.type === "2") this.deliveryTiles.push({ x: tile.x, y: tile.y })
      if (normalizedTile.type === "1") this.spawnTiles.push({ x: tile.x, y: tile.y })
    }

    console.log(
      `[BeliefBase] Map: ${width}x${height} | delivery=${this.deliveryTiles.length} spawn=${this.spawnTiles.length}`
    )
  }

  /** @param {any} config */
  updateConfig(config) {
    this.config = config

    const player = config?.GAME?.player
    const parcels = config?.GAME?.parcels

    if (player?.movement_duration) {
      this.movementDurationMs = player.movement_duration
      this.blockedMoveTtlMs = Math.max(DEFAULT_BLOCKED_MOVE_TTL_MS, this.movementDurationMs * 8)
    }
    if (player?.observation_distance) {
      this.observationDistance = player.observation_distance
    }
    if (parcels?.decaying_event?.ms) {
      this.decayIntervalMs = parcels.decaying_event.ms
    }

    console.log(
      `[BeliefBase] Config | move=${this.movementDurationMs}ms decay=${this.decayIntervalMs}ms obs=${this.observationDistance}`
    )
  }

  /** @param {{ id:string, name:string, x:number, y:number, score:number }} agent */
  updateMe(agent) {
    this.me = agent
    this.noteVisit(agent.x, agent.y)
    this.events.emit("me-moved", { me: agent })
  }


  // Sensing update 
  /**
   * @param {{ agents: any[], parcels: any[], crates?: any[], positions?: any[] }} sensing
   * @returns {{ newParcels: boolean, parcelGone: boolean, parcelChanged: boolean }}
   */
  // This is flag if there is new parcel, parcel gone, parcel is changed
  updateSensing(sensing) {
    const now = Date.now()
    let newParcels = false
    let parcelGone = false
    let parcelChanged = false

    // This part is for our agent to check other agent movement
    // It temporarily saves the old list of agents, clears the current list, and repopulates it with the newly seen agents. 
    // If an agent's x or y changed from the previous memory, it emits an "agent-moved" event.
    const prevAgents = new Map(this.agents)
    this.agents.clear()
    for (const agent of sensing.agents ?? []) {
      const prev = prevAgents.get(agent.id)
      this.agents.set(agent.id, { ...agent, lastSeen: now })
      if (prev && (prev.x !== agent.x || prev.y !== agent.y)) {
        this.events.emit("agent-moved", { agent })
      }
    }

    // Logic for crates
    this.crates.clear()
    for (const crate of sensing.crates ?? []) {
      this.crates.set(crate.id, { ...crate, lastSeen: now })
    }

    this.positions = [...(sensing.positions ?? [])]

    // Parcel losgic
    // If new parcel appear add to lastSeen
    // saves its initial reward as baseReward
    // flags newParcels = true and emits "parcel-appeared".
    // For existing if someone picked it up (carrierChanged)
    // if it moved/lost value (posOrRewardChanged).
    const seenParcelIds = new Set()
    for (const parcel of sensing.parcels ?? []) {
      seenParcelIds.add(parcel.id)
      const existing = this.parcels.get(parcel.id)

      if (!existing) {
        newParcels = true
        this.parcels.set(parcel.id, {
          ...parcel,
          lastSeen: now,
          baseReward: parcel.reward,
        })
        this.events.emit("parcel-appeared", { parcel: this.parcels.get(parcel.id) })
      } else {
        const carrierChanged = (existing.carriedBy ?? null) !== (parcel.carriedBy ?? null)
        const posOrRewardChanged =
          existing.x !== parcel.x ||
          existing.y !== parcel.y ||
          existing.reward !== parcel.reward

        if (carrierChanged || posOrRewardChanged) {
          parcelChanged = true
        }

        this.parcels.set(parcel.id, {
          ...parcel,
          lastSeen: now,
          baseReward: existing.baseReward,
        })

        if (carrierChanged) {
          this.events.emit("carry-changed", {
            parcel: this.parcels.get(parcel.id),
            carriedBy: parcel.carriedBy ?? null,
          })
        } else if (posOrRewardChanged) {
          this.events.emit("parcel-changed", { parcel: this.parcels.get(parcel.id) })
        }
      }
    }

    // We are pruning parcels that are not in sensing range again
    // The agent checks its memory for parcels it previously knew about but didn't see in this current update (seenParcelIds.has(id)).
    if (this.me) {
      const mx = Math.round(this.me.x)
      const my = Math.round(this.me.y)

      for (const [id, parcel] of this.parcels) {
        if (seenParcelIds.has(id)) continue
      // If the agent itself was carrying the parcel and is standing on a delivery tile, it assumes the parcel was successfully delivered. It deletes it from memory and emits "parcel-gone"
        if (parcel.carriedBy === this.me.id) {
          if (this.isDeliveryTile(mx, my)) {
            this.parcels.delete(id)
            parcelGone = true
            this.events.emit("parcel-gone", { parcelId: id })
          }
          continue
        }
    // If a parcel is supposed to be close enough to see (distance < this.observationDistance) but wasn't in the sensing data, the agent deduces it has disappeared. If someone else was carrying it, it emits "parcel-taken"; otherwise, it emits "parcel-gone". 
        const dist = Math.abs(parcel.x - mx) + Math.abs(parcel.y - my)
        if (dist < this.observationDistance) {
          // Within observation range but not seen → taken or expired
          const wasTaken = parcel.carriedBy && parcel.carriedBy !== this.me.id
          this.parcels.delete(id)
          parcelGone = true
          this.events.emit(wasTaken ? "parcel-taken" : "parcel-gone", { parcelId: id })
        }
      }
    }

    return { newParcels, parcelGone, parcelChanged }
  }

  // Reward estimation from revision.js and apply decayIntervalMs and movementDurationMs from agent

  /** @param {{ reward?:number, baseReward?:number, lastSeen:number }} parcel */
  estimateReward(parcel) {
    return estimateReward(parcel, this.decayIntervalMs)
  }

  /**
   * @param {{ reward?:number, baseReward?:number, lastSeen:number }} parcel
   * @param {number} stepsAway
   */
  estimateRewardOnArrival(parcel, stepsAway) {
    return estimateRewardOnArrival(
      parcel,
      stepsAway,
      this.movementDurationMs,
      this.decayIntervalMs
    )
  }

  // Check if x,y coor matches any deliveryTiles
  /** @param {number} x @param {number} y */
  isDeliveryTile(x, y) {
    return this.deliveryTiles.some(
      (tile) => tile.x === Math.round(x) && tile.y === Math.round(y)
    )
  }
  // Blocked-move tracking
  // If the agent tries to a direction and fails
  // it saves the current time plus the TTL.
  markMoveBlocked(x, y, dir) {
    const key = `${Math.round(x)},${Math.round(y)}`
    const blocked = this.blockedMoves.get(key) ?? new Map()
    blocked.set(dir, Date.now() + this.blockedMoveTtlMs)
    this.blockedMoves.set(key, blocked)
  }
  // Manually removes a block if the agent realizes the path is clear.
  clearBlockedMove(x, y, dir) {
    const key = `${Math.round(x)},${Math.round(y)}`
    const blocked = this.blockedMoves.get(key)
    if (!blocked) return
    blocked.delete(dir)
    if (blocked.size === 0) this.blockedMoves.delete(key)
  }
  // Checks if a direction is currently blocked
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
  // Visit tracking
  // Convert coordinate into string and increment counter
  //  Too prevent infinite loop exploring teritory
  noteVisit(x, y) {
    const key = `${Math.round(x)},${Math.round(y)}`
    this.visits.set(key, (this.visits.get(key) ?? 0) + 1)
  }
  getVisitCount(x, y) {
    return this.visits.get(`${Math.round(x)},${Math.round(y)}`) ?? 0
  }


  // Temp function to ignore tragets
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
