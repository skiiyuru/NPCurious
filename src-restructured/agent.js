/**
 * This file implements the BDI (Belief-Desire-Intention) loop. It connects 
 * everything together:
 * 1. The game server updates our BELIEFS (Notebook).
 * 2. The Brainstormer generates DESIRES (Options).
 * 3. The Analyst & Dispatcher pick an INTENTION (Work Order).
 * 4. The Foreman picks a PLAN (Operation Manual).
 * 5. The CEO executes the plan, one step at a time.
 * * CORE RESPONSIBILITIES:
 * * 1. HIRING & WIRING (constructor & start):
 * Instantiates all the helper classes and connects them to the game socket.
 * * 2. THE EXECUTION LOOP (_executionLoop):
 * An infinite loop that acts as the beating heart of the robot. It constantly 
 * asks: "Do I have a plan? If yes, take one step. If no, think of a plan."
 * * 3. PHYSICAL MOVEMENT (_execute):
 * Translates the plan into actual network messages sent to the game server 
 * (like "move up" or "pickup"), and updates the Notebook if the agent 
 * accidentally bumps into a wall.
 * ============================================================================
 */

import { BeliefBase }       from "./beliefs/BeliefBase.js"
import { BeliefQueries }    from "./beliefs/queries.js"
import { createOptionGenerator } from "./options/generator.js"
import { filterOptions }    from "./options/filter.js"
import { IntentionQueue }   from "./intentions/IntentionQueue.js"
import { ReplaceStrategy }  from "./intentions/strategies/Replace.js"
import { PlanSelector }     from "./plans/selector.js"
import { GoPickUp }         from "./plans/library/GoPickUp.js"
import { GoDeliver }        from "./plans/library/GoDeliver.js"
import { GoExplore }        from "./plans/library/GoExplore.js"
import { BlindMove }        from "./plans/library/BlindMove.js"
import { findPathWithFallback } from "./utils/pathfinding.js"
import { manhattan }        from "./utils/distance.js"

const FAILED_TARGET_BLACKLIST_MS = 2500

export class BDIAgent {
  /**
   * @param {import("@unitn-asa/deliveroo-js-sdk").DjsClientSocket} socket
   */
  constructor(socket) {
    this.socket = socket

    //  Belief
    this.beliefBase = new BeliefBase()
    this.queries    = new BeliefQueries(this.beliefBase)
    // Intentions
    this._intentionQueue = new IntentionQueue(
      new ReplaceStrategy(),  // swap to QueueStrategy or ReviseStrategy for Phase 4
      this.queries
    )
    // Plans 
    this._planSelector = new PlanSelector([
      new GoPickUp(this.beliefBase, this.queries),
      new GoDeliver(this.beliefBase, this.queries),
      new GoExplore(this.beliefBase, this.queries),
      new BlindMove(this.beliefBase, this.queries),
    ])

    /** @type {{ action: string, dir?: string }[]} */
    this._plan = []

    this._reDeliberate = false
  }

  // Booting
  start() {
    this.socket.onConfig((config) => {
      this.beliefBase.updateConfig(config)
    })
    this.socket.onMap((width, height, tiles) => {
      this.beliefBase.updateMap(width, height, tiles)
    })
    this.socket.onYou((agent) => {
      this.beliefBase.updateMe(agent)
    })

    // calls _onOptionsReady whenever intentions idea comes
    const { generate } = createOptionGenerator(
      this.beliefBase,
      this.queries,
      (options) => this._onOptionsReady(options)
    )
    this._generateOptions = generate

    this.socket.onSensing((sensing) => { // Server tells agents what it sees
      const { newParcels, parcelGone, parcelChanged } =
        this.beliefBase.updateSensing(sensing)
      //  If something happen with parcels redelibrate becomes true
      if (newParcels || parcelGone || parcelChanged) {
        this._reDeliberate = true
      }
    })

    this._executionLoop() // this will loop
  }


  /**
   * @param {any[]} rawOptions
   */
  // All intentnion will be ranked and scored by filterOptions and willbe choose th best one
  _onOptionsReady(rawOptions) {
    const scored = filterOptions(rawOptions, this.beliefBase, this.queries)
    if (scored.length === 0) return
    const best = scored[0]
    this._intentionQueue.push(best)

    // If the top intention changed invalidate the current plan
    const current = this._intentionQueue.current
    if (current && this._plan.length > 0) {
      // Check if the new top intention differs from currently runbning
      this._reDeliberate = true
    }
  }

  //Cleans expired blacklists create new intention
  deliberate() {
    this.beliefBase.pruneBlacklistedTargets()
    this._intentionQueue.pruneInvalid()
    // Manually trigger option generation in case events havent fired
    this._generateOptions()
  }

  // Create new plan
  _generatePlan() {
    const intention = this._intentionQueue.current
    if (!intention) return []

    const plan = this._planSelector.selectPlan(intention)
    if (!plan) return []

    const actions = plan.execute(intention)
    this._intentionQueue.setPlanLength(actions.length)
    return actions
  }

  // Buffer when the game starts
  async _executionLoop() {
    while (!this.beliefBase.me || !this.beliefBase.mapWidth) {
      await this._sleep(100)
    }
    console.log("[BDIAgent] Starting BDI loop...")

    // This will run all until we shut down
    while (true) {
      if (this._reDeliberate || this._plan.length === 0) {
        this._reDeliberate = false
        this.deliberate()

        if (this._plan.length === 0) {
          this._plan = this._generatePlan()
        }
      }
      // If plan still not exist restart loop and wait for a bit
      if (this._plan.length === 0) {
        await this._sleep(200)
        continue
      }
      const step = this._plan.shift()
      const success = await this._execute(step)
      // Update progress bar if succes if failed (hitting wall etc) put intention to blacklist
      if (success) {
        this._intentionQueue.onStepCompleted()
      } else {
        console.log(`[BDIAgent] Action failed: ${JSON.stringify(step)} — replanning`)
        if (step.action !== "move" && this._plan.length <= 2) {
          this._blacklistCurrentTarget(FAILED_TARGET_BLACKLIST_MS)
        }
        this._intentionQueue.onIntentionFailed()
        this._plan = []
      }
    }
  }

  /**
   * @param {{ action: string, dir?: string }} step
   * @returns {Promise<boolean>}
   */
  // DIrection log
  async _execute(step) {
    try {
      switch (step.action) {
        case "move": {
          const me = this.beliefBase.me
          const fromX = me ? Math.round(me.x) : null
          const fromY = me ? Math.round(me.y) : null
          const dx = step.dir === "right" ? 1 : step.dir === "left" ? -1 : 0
          const dy = step.dir === "up"    ? 1 : step.dir === "down" ? -1 : 0
          const expectedX = fromX === null ? null : fromX + dx
          const expectedY = fromY === null ? null : fromY + dy

          const result = await this.socket.emitMove(step.dir)
          if (!result) {
            if (fromX !== null && fromY !== null) {
              this.beliefBase.markMoveBlocked(fromX, fromY, step.dir)
            }
            return false
          }

          const toX = typeof result.x === "number" ? Math.round(result.x) : expectedX
          const toY = typeof result.y === "number" ? Math.round(result.y) : expectedY
          const moved =
            fromX === null || fromY === null ||
            (toX !== null && toY !== null && (toX !== fromX || toY !== fromY))

          if (!moved) {
            if (fromX !== null && fromY !== null) {
              this.beliefBase.markMoveBlocked(fromX, fromY, step.dir)
            }
            return false
          }

          if (fromX !== null && fromY !== null) {
            this.beliefBase.clearBlockedMove(fromX, fromY, step.dir)
          }

          if (this.beliefBase.me) {
            this.beliefBase.me.x = toX ?? this.beliefBase.me.x
            this.beliefBase.me.y = toY ?? this.beliefBase.me.y
            this.beliefBase.noteVisit(this.beliefBase.me.x, this.beliefBase.me.y)
          }

          if (expectedX !== toX || expectedY !== toY) {
            this._reDeliberate = true
          }
          return true
        }
        // Same thing
        case "pickup": {
          const picked = await this.socket.emitPickup()
          if (!picked || picked.length === 0) {
            console.log("[BDIAgent] Pickup returned nothing — parcel may have vanished")
            this._blacklistCurrentTarget(FAILED_TARGET_BLACKLIST_MS)
            this._reDeliberate = true
          } else {
            console.log(`[BDIAgent] Picked up ${picked.length} parcel(s)`)
            for (const parcel of picked) {
              const existing = this.beliefBase.parcels.get(parcel.id)
              if (existing) existing.carriedBy = this.beliefBase.me?.id
            }
            this._reDeliberate = true
          }
          return true
        }
        // same thing
        case "putdown": {
          const carriedBefore = this.queries.getCarriedParcels()
          const dropped = await this.socket.emitPutdown()

          if (dropped && dropped.length > 0) {
            console.log(`[BDIAgent] Delivered ${dropped.length} parcel(s)`)
            for (const parcel of dropped) {
              this.beliefBase.parcels.delete(parcel.id)
            }
          } else if (
            carriedBefore.length > 0 &&
            this.beliefBase.me &&
            this.beliefBase.isDeliveryTile(this.beliefBase.me.x, this.beliefBase.me.y)
          ) {
            for (const parcel of carriedBefore) {
              this.beliefBase.parcels.delete(parcel.id)
            }
          }

          this._intentionQueue.onIntentionSucceeded()
          this._plan = []
          this._reDeliberate = true
          return true
        }

        default:
          return false
      }
    } catch (error) {
      console.error(`[BDIAgent] Error on "${step.action}":`, error.message)
      return false
    }
  }

  _blacklistCurrentTarget(ttlMs) {
    const intention = this._intentionQueue.current
    if (!intention?.target) return
    const key = intention.target.id
      ? `parcel:${intention.target.id}`
      : `tile:${Math.round(intention.target.x)},${Math.round(intention.target.y)}`
    this.beliefBase.blacklistTarget(key, ttlMs)
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
