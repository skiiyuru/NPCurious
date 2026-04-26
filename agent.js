import { Pathfinder } from "./pathfinder.js"
import { AutomatedPlanner } from "./planner.js"

// Moods for taking package, stand still, etc
const INTENT = Object.freeze({
  IDLE: "IDLE",
  PICKUP: "PICKUP",
  DELIVER: "DELIVER",
  EXPLORE: "EXPLORE",
})
const OPPORTUNISTIC_PICKUP_STEPS = 2
const FAILED_TARGET_BLACKLIST_MS = 2500

export class BDIAgent {
  /**
   * @param {import("@unitn-asa/deliveroo-js-sdk").DjsClientSocket} socket
   * @param {import("./beliefs.js").BeliefBase} beliefs
   */
    // Connect tools and init _deliveryDistCache. This caches heavy distance calculations for nearby packages to save CPU.
  constructor(socket, beliefs) {
    this.socket = socket
    this.beliefs = beliefs
    this.pf = new Pathfinder(beliefs)
    this.planner = new AutomatedPlanner(beliefs)

    /** @type {{ type: string, target: any }} */
    this.intention = { type: INTENT.IDLE, target: null }
    /** @type {{ action: string, dir?: string }[]} */
    this.plan = []

    this._reDeliberate = false
    /**
     * Cached delivery distances keyed by `"x,y"`.
     * Invalidated on every deliberation cycle to stay fresh.
     * @type {Map<string, number>}
     */
    this._deliveryDistCache = new Map()
  }
  // Setup server connection & map. Listen for onSensing events to update memory
  // If significant state changes occur packages added/removed, force a route recalculation _reDeliberate = true.
  start() {
    this.socket.onConfig((config) => {
      this.beliefs.updateConfig(config)
    })

    this.socket.onMap((width, height, tiles) => {
      this.beliefs.updateMap(width, height, tiles)
    })

    this.socket.onYou((agent) => {
      this.beliefs.updateMe(agent)
    })

    this.socket.onSensing((sensing) => {
      const { newParcels, parcelGone, parcelChanged } =
        this.beliefs.updateSensing(sensing)

      if (newParcels || parcelGone || parcelChanged) {
        this._reDeliberate = true
      }
    })

    this._executionLoop()
  }

  deliberate() {
    const me = this.beliefs.me
    if (!me) return
    this.beliefs.pruneBlacklistedTargets()

    // Invalidate the delivery-distance cache at the top of each deliberation
    this._deliveryDistCache.clear()

    const carried = this.beliefs.getCarriedParcels()
    const free = this.beliefs
      .getFreeParcels()
      .filter((parcel) => !this._isTargetBlacklisted(INTENT.PICKUP, parcel))
    // Check inventory state. If a package is held, this takes absolute priority
    // Find the closest drop-off zone calculating true walking distance and execute delivery.
    if (carried.length > 0) {
      // Use actual path-based nearest delivery (nearestDelivery now uses real BFS)
      const delivery = this.pf.nearestDelivery(me.x, me.y)
      if (
        delivery &&
        (this.intention.type !== INTENT.DELIVER ||
          !this._sameTarget(this.intention.target, delivery))
      ) {
        this._setIntention(
          INTENT.DELIVER,
          delivery,
          `carrying ${carried.length} parcel(s)`
        )
      }
      return
    }

    if (free.length > 0) {
      // If inventory is empty, evaluate all available packages using the profit heuristic function and commit to the one with the highest score.
      // best overall and the best within OPPORTUNISTIC_PICKUP_STEPS.
      const { nearby, best } = this._selectParcels(free, me)

      if (nearby && (nearby.score > 0 || nearby.rewardOnArrival > 0)) {
        if (
          this.intention.type !== INTENT.PICKUP ||
          !this._sameTarget(this.intention.target, nearby)
        ) {
          this._setIntention(
            INTENT.PICKUP,
            nearby,
            nearby.score > 0
              ? `nearby score=${nearby.score.toFixed(1)}`
              : `nearby reward=${nearby.rewardOnArrival}`
          )
        }
        return
      }

      if (best && (best.score > 0 || best.rewardOnArrival > 0)) {
        if (
          this.intention.type !== INTENT.PICKUP ||
          !this._sameTarget(this.intention.target, best)
        ) {
          this._setIntention(
            INTENT.PICKUP,
            best,
            best.score > 0
              ? `score=${best.score.toFixed(1)}`
              : `reward=${best.rewardOnArrival}`
          )
        }
        return
      }
    }

    const needNewTarget =
      this.intention.type !== INTENT.EXPLORE ||
      !this.intention.target ||
      this._isAt(me, this.intention.target) ||
      this.plan.length === 0

    if (!needNewTarget) return
    // Handle empty map state. Query pathfinding for unvisited areas to explore. 
    // If explored with no targets, set intention to IDLE and wait.
    const target = this.pf.nextExplorationTarget(
      me.x,
      me.y,
      this.intention.type === INTENT.EXPLORE ? this.intention.target : null,
      (tile) => this._isTargetBlacklisted(INTENT.EXPLORE, tile)
    )

    if (target) {
      this._setIntention(
        INTENT.EXPLORE,
        target,
        free.length > 0 ? "no viable parcel path" : "no parcels visible"
      )
    } else if (this.intention.type !== INTENT.IDLE) {
      this._debugState("IDLE")
      this.intention = { type: INTENT.IDLE, target: null }
      this.plan = []
    }
  }

  /**
   * Single-pass parcel evaluation — computes both "nearby" and "best" in one
   * loop so pathfinding is not duplicated.
   *
   * @param {any[]} parcels
   * @param {{ x:number, y:number }} me
   * @returns {{ nearby: any|null, best: any|null }}
   */
  _selectParcels(parcels, me) {
    let nearby = null
    let best = null

    for (const parcel of parcels) {
      const pickupPath = this._findPathWithFallback(
        me.x,
        me.y,
        parcel.x,
        parcel.y
      )
      if (pickupPath === null) continue

      const pickupSteps = pickupPath.length
      const rewardOnArrival = this.beliefs.estimateRewardOnArrival(
        parcel,
        pickupSteps
      )
      const deliverySteps = this._bestDeliveryDistanceFrom(parcel.x, parcel.y)
      if (!Number.isFinite(deliverySteps)) continue

      const decayPerStep =
        this.beliefs.decayIntervalMs === Infinity
          ? 0
          : this.beliefs.movementDurationMs / this.beliefs.decayIntervalMs

      const baseScore =
        rewardOnArrival - deliverySteps * decayPerStep

      // "nearby" candidate: within opportunistic range
      if (pickupSteps <= OPPORTUNISTIC_PICKUP_STEPS) {
        const nearbyScore = baseScore + (OPPORTUNISTIC_PICKUP_STEPS - pickupSteps) * 8
        if (!nearby || nearbyScore > nearby.score) {
          nearby = { ...parcel, score: nearbyScore, steps: pickupSteps, rewardOnArrival, deliverySteps }
        }
      }

      // "best" candidate: unrestricted range
      if (!best || baseScore > best.score) {
        best = { ...parcel, score: baseScore, steps: pickupSteps, rewardOnArrival, deliverySteps }
      }
    }

    return { nearby, best }
  }

  /**
   * Returns the minimum path length from (fromX, fromY) to any delivery tile.
   * Results are cached per position within a single deliberation cycle.
   */
  _bestDeliveryDistanceFrom(fromX, fromY) {
    const key = `${Math.round(fromX)},${Math.round(fromY)}`
    if (this._deliveryDistCache.has(key)) {
      return this._deliveryDistCache.get(key)
    }

    let best = Infinity
    for (const tile of this.beliefs.deliveryTiles) {
      const path = this._findPathWithFallback(fromX, fromY, tile.x, tile.y)
      if (path !== null && path.length < best) {
        best = path.length
      }
    }

    this._deliveryDistCache.set(key, best)
    return best
  }

  _findPathWithFallback(fromX, fromY, toX, toY) {
    const preferred = this.pf.findPath(fromX, fromY, toX, toY, {
      avoidAgents: true,
      avoidCrates: true,
    })
    if (preferred !== null) return preferred

    return this.pf.findPath(fromX, fromY, toX, toY, {
      avoidAgents: false,
      avoidCrates: true,
    })
  }

  /**
   * @param {string} type
   * @param {any} target
   * @param {string} reason
   */
  _setIntention(type, target, reason = "") {
    if (
      this.intention.type === type &&
      this._sameTarget(this.intention.target, target)
    ) {
      return
    }

    console.log(`[Deliberate] ${type}${reason ? ` - ${reason}` : ""}`)
    this.intention = { type, target }
    this.plan = this.generatePlan()
    this._debugState("INTENTION")
  }

  generatePlan() {
    return this.planner.buildPlan(this.intention)
  }

  async _executionLoop() {
    while (!this.beliefs.me || !this.beliefs.mapWidth) {
      await this._sleep(100)
    }

    console.log("[Agent] Starting BDI loop...")

    while (true) {
      if (this._reDeliberate || this.plan.length === 0) {
        this._reDeliberate = false
        this.deliberate()

        if (this.plan.length === 0) {
          this.plan = this.generatePlan()
        }
      }

      if (this.plan.length === 0) {
        await this._sleep(200)
        continue
      }

      const step = this.plan.shift()
      const success = await this._execute(step)

      if (!success) {
        console.log(`[Exec] Action failed: ${JSON.stringify(step)} - replanning`)
        this._debugState("FAIL", step)
        if (step.action !== "move" && this.plan.length <= 2) {
          this._blacklistCurrentTarget(FAILED_TARGET_BLACKLIST_MS)
        }
        this.plan = []
      }
    }
  }

  /**
   * @param {{ action: string, dir?: string }} step
   * @returns {Promise<boolean>}
   */
  async _execute(step) {
    try {
      switch (step.action) {
        case "move": {
          const me = this.beliefs.me
          const fromX = me ? Math.round(me.x) : null
          const fromY = me ? Math.round(me.y) : null
          const dx = step.dir === "right" ? 1 : step.dir === "left" ? -1 : 0
          const dy = step.dir === "up" ? 1 : step.dir === "down" ? -1 : 0
          const expectedX = fromX === null ? null : fromX + dx
          const expectedY = fromY === null ? null : fromY + dy

          const result = await this.socket.emitMove(step.dir)
          if (!result) {
            if (fromX !== null && fromY !== null) {
              this.beliefs.markMoveBlocked(fromX, fromY, step.dir)
            }
            return false
          }

          const toX =
            typeof result.x === "number" ? Math.round(result.x) : expectedX
          const toY =
            typeof result.y === "number" ? Math.round(result.y) : expectedY
          const moved =
            fromX === null ||
            fromY === null ||
            (toX !== null && toY !== null && (toX !== fromX || toY !== fromY))

          if (!moved) {
            console.log(
              `[Exec] Move "${step.dir}" acknowledged without position change`
            )
            if (fromX !== null && fromY !== null) {
              this.beliefs.markMoveBlocked(fromX, fromY, step.dir)
            }
            return false
          }

          if (fromX !== null && fromY !== null) {
            this.beliefs.clearBlockedMove(fromX, fromY, step.dir)
          }

          if (this.beliefs.me) {
            this.beliefs.me.x = toX ?? this.beliefs.me.x
            this.beliefs.me.y = toY ?? this.beliefs.me.y
            this.beliefs.noteVisit(this.beliefs.me.x, this.beliefs.me.y)
          }

          if (expectedX !== toX || expectedY !== toY) {
            this._reDeliberate = true
          }
          return true
        }

        case "pickup": {
          const picked = await this.socket.emitPickup()
          if (!picked || picked.length === 0) {
            console.log("[Exec] Pickup returned nothing - parcel may have vanished")
            this._reDeliberate = true
            // Still return true: the pickup action was submitted, we just need
            // to re-deliberate since the parcel is gone.
          } else {
            console.log(`[Exec] Picked up ${picked.length} parcel(s)`)
            for (const parcel of picked) {
              const existing = this.beliefs.parcels.get(parcel.id)
              if (existing) existing.carriedBy = this.beliefs.me?.id
            }
            this._reDeliberate = true
          }
          return true
        }

        case "putdown": {
          const carriedBeforeDrop = this.beliefs.getCarriedParcels()
          const dropped = await this.socket.emitPutdown()
          if (dropped && dropped.length > 0) {
            console.log(`[Exec] Delivered ${dropped.length} parcel(s)`)
            for (const parcel of dropped) {
              this.beliefs.parcels.delete(parcel.id)
            }
          } else if (
            carriedBeforeDrop.length > 0 &&
            this.beliefs.me &&
            this.beliefs.isDeliveryTile(this.beliefs.me.x, this.beliefs.me.y)
          ) {
            console.log(
              `[Exec] Putdown returned no parcels, clearing ${carriedBeforeDrop.length} carried parcel belief(s) at delivery tile`
            )
            for (const parcel of carriedBeforeDrop) {
              this.beliefs.parcels.delete(parcel.id)
            }
          }

          this.intention = { type: INTENT.IDLE, target: null }
          this.plan = []
          this._reDeliberate = true
          return true
        }

        default:
          return false
      }
    } catch (error) {
      console.error(`[Exec] Error on "${step.action}":`, error.message)
      return false
    }
  }

  /** @param {number} ms */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  _sameTarget(a, b) {
    if (!a || !b) return a === b
    if (a.id || b.id) return a?.id === b?.id

    return (
      Math.round(a.x) === Math.round(b.x) &&
      Math.round(a.y) === Math.round(b.y)
    )
  }

  _isAt(position, target) {
    if (!target) return false

    return (
      Math.round(position.x) === Math.round(target.x) &&
      Math.round(position.y) === Math.round(target.y)
    )
  }

  _blacklistCurrentTarget(ttlMs) {
    const key = this._targetKey(this.intention.type, this.intention.target)
    if (!key) return
    this.beliefs.blacklistTarget(key, ttlMs)
  }

  _isTargetBlacklisted(type, target) {
    const key = this._targetKey(type, target)
    return key ? this.beliefs.isTargetBlacklisted(key) : false
  }

  _targetKey(type, target) {
    if (!target) return null
    if (type === INTENT.PICKUP) {
      return target.id ? `parcel:${target.id}` : null
    }

    if (typeof target.x === "number" && typeof target.y === "number") {
      return `tile:${Math.round(target.x)},${Math.round(target.y)}`
    }

    return null
  }

  _debugState(label, step = null) {
    const me = this.beliefs.me
    if (!me) return

    const rounded = { x: Math.round(me.x), y: Math.round(me.y) }
    const visibleParcels = this.beliefs.getFreeParcels().map((parcel) => ({
      id: parcel.id,
      x: parcel.x,
      y: parcel.y,
      reward: parcel.reward,
    }))
    const nearbyTiles = [
      [0, 1, "up"],
      [0, -1, "down"],
      [-1, 0, "left"],
      [1, 0, "right"],
    ].map(([dx, dy, dir]) => {
      const x = rounded.x + dx
      const y = rounded.y + dy
      const tile = this.beliefs.map.get(`${x},${y}`)
      return `${dir}:${tile ? tile.type : "X"}`
    })

    const target =
      this.intention.target &&
      typeof this.intention.target.x === "number" &&
      typeof this.intention.target.y === "number"
        ? `(${Math.round(this.intention.target.x)},${Math.round(this.intention.target.y)})`
        : this.intention.target?.id ?? "none"

    console.log(
      `[Debug] ${label} me=(${rounded.x},${rounded.y}) intent=${this.intention.type} target=${target} step=${step ? JSON.stringify(step) : "none"} plan=${this.plan.map((item) => item.dir ?? item.action).join(" > ") || "empty"} tiles=[${nearbyTiles.join(", ")}] parcels=${visibleParcels.length} sensingPositions=${this.beliefs.positions.length}`
    )
    if (visibleParcels.length > 0) {
      console.log(
        `[Debug] visible parcels ${visibleParcels
          .slice(0, 5)
          .map(
            (parcel) =>
              `${parcel.id}@(${parcel.x},${parcel.y})#${parcel.reward}`
          )
          .join(" | ")}`
      )
    }
  }
}
