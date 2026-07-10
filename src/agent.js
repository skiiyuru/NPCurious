/** @fileoverview BDI agent factory: wires percepts, deliberation, and plan execution. */

import { BeliefBase } from "./beliefs/BeliefBase.js"
import { BeliefEvents } from "./beliefs/events.js"
import { MessageBus } from "./comms/MessageBus.js"
import { Protocols } from "./comms/protocols.js"
import { wireTransport, wireBeliefCoordination } from "./comms/wireComms.js"
import { IntentionQueue } from "./intentions/IntentionQueue.js"
import { ReviseStrategy } from "./intentions/strategies/Revise.js"
import { applyUserCommand } from "./llm/adapter.js"
import { generateOptions } from "./options/generator.js"
import { selectBestOption } from "./options/filter.js"
import { ExternalPlanner } from "./planning/pddl/ExternalPlanner.js"
import { PlanSelector } from "./plans/selector.js"
import { estimateCarryCapacity } from "./utils/capacity.js"
import { errorMessage } from "./utils/errors.js"

/**
 * Bind server percept events to belief-base revision methods.
 * @param {import('./types.js').Socket} socket
 * @param {import('./types.js').Beliefs} beliefs
 */
export function wireSocketPercepts(socket, beliefs) {
  if (!socket || typeof socket.on !== "function")
    throw new Error(
      "createBdiAgent requires a socket with an on(event, handler) API"
    )
  socket.on("config", (config) => {
    beliefs.reviseConfig(config)
  })
  socket.on("you", (agent) => {
    if (agent)
      beliefs.reviseYou(
        agent.id,
        agent.name ?? "",
        agent.x,
        agent.y,
        agent.score ?? 0
      )
  })
  socket.on("map", (width, height, tiles) => {
    beliefs.reviseMap(width, height, tiles)
  })
  socket.on("tile", (tile) => {
    if (tile) beliefs.reviseTile(tile)
  })
  socket.on("sensing", (sensing) => {
    if (!sensing) return
    beliefs.reviseParcels(sensing.parcels ?? [])
    beliefs.reviseAgents(sensing.agents ?? [])
  })
}

/** Max BDI cycles per loop invocation — prevents infinite spin on a single belief change. */
const MAX_BDI_CYCLES = 100

/**
 * Copy config knobs into `beliefs.strategy` so scorers can read them.
 * @param {import('./types.js').Beliefs} beliefs
 * @param {import('./types.js').Config} config
 */
function seedStrategy(beliefs, config) {
  Object.assign(beliefs.strategy, {
    rewardDecayPerStep: config.rewardDecayPerStep,
    lambdaDistanceDecay: config.lambdaDistanceDecay,
    lambdaTimeDecay: config.lambdaTimeDecay,
    agentStealRiskWeight: config.agentStealRiskWeight,
    sensingRange: config.sensingRange,
    sensorMissProbability: config.sensorMissProbability,
  })
}

/**
 * Default socket action wrappers (move, pickup, putdown).
 * @param {import('./types.js').Socket} socket
 * @returns {{ move: Function, pickup: Function, putdown: Function }}
 */
function defaultActions(socket) {
  return {
    move: (direction) => socket.emitMove?.(direction),
    pickup: () => socket.emitPickup?.(),
    putdown: (parcelIds) => socket.emitPutdown?.(parcelIds),
  }
}

/**
 * @typedef {Object} BdiAgentOptions
 * @property {import('./types.js').Socket} [socket]
 * @property {import('./types.js').Config} [config]
 * @property {import('./types.js').Beliefs} [beliefs]
 * @property {import('./types.js').IntentionQueue} [intentions]
 * @property {import('./plans/selector.js').PlanSelector} [plans]
 * @property {import('./planning/pddl/ExternalPlanner.js').ExternalPlanner} [planner]
 * @property {import('./types.js').MessageBus} [bus]
 * @property {{ move: Function, pickup: Function, putdown: Function }} [actions]
 * @property {import('./types.js').Logger} [logger]
 * @property {boolean} [autoRun]
 */

/**
 * @typedef {Object} BdiAgent
 * @property {import('./types.js').Socket} socket
 * @property {import('./types.js').Beliefs} beliefs
 * @property {import('./types.js').IntentionQueue} intentions
 * @property {import('./plans/selector.js').PlanSelector} plans
 * @property {import('./planning/pddl/ExternalPlanner.js').ExternalPlanner} planner
 * @property {import('./types.js').MessageBus} bus
 * @property {{ move: Function, pickup: Function, putdown: Function }} actions
 * @property {import('./types.js').Config} config
 * @property {Function} deliberate
 * @property {Function} reconsider
 * @property {Function} runBdiLoop
 */

/**
 * Create and wire a full BDI agent. Returns the agent's public API surface.
 * @param {BdiAgentOptions} [options]
 * @returns {BdiAgent}
 */
export function createBdiAgent({
  socket,
  config = {},
  beliefs = new BeliefBase(),
  intentions,
  plans = new PlanSelector(),
  planner,
  bus = new MessageBus(),
  actions,
  logger = console,
  autoRun = true,
} = {}) {
  const runtimeConfig = { ...config }
  const intentionQueue =
    intentions ?? new IntentionQueue(new ReviseStrategy(runtimeConfig))
  const externalPlanner =
    planner ??
    new ExternalPlanner({
      usePlanner: runtimeConfig.usePlanner,
      url: runtimeConfig.plannerUrl,
      timeoutMs: runtimeConfig.plannerTimeoutMs,
    })
  const typedSocket = /** @type {import('./types.js').Socket} */ (socket)
  const actionAdapter = actions ?? defaultActions(typedSocket)

  seedStrategy(beliefs, runtimeConfig)
  wireSocketPercepts(typedSocket, beliefs)

  // Track peer agent id once we receive a STATUS_REPORT from them.
  let peerAgentId = null
  bus.on(Protocols.STATUS_REPORT, (msg) => {
    if (msg.agentId && msg.agentId !== beliefs.me?.id) peerAgentId = msg.agentId
  })

  // Broadcast status once if peer id unknown, then switch to direct messages.
  let statusBroadcastOnce = false
  function reportStatus() {
    if (!beliefs.me) return
    const current = intentionQueue.current()
    const payload = {
      agentId: beliefs.me.id,
      name: beliefs.me.name,
      x: beliefs.me.x,
      y: beliefs.me.y,
      carrying: beliefs.getCarriedParcels().map((p) => p.id),
      intention: current?.predicate ?? null,
      paused: Boolean(beliefs.strategy?.paused),
    }
    if (peerAgentId) bus.tell(peerAgentId, Protocols.STATUS_REPORT, payload)
    else if (!statusBroadcastOnce) {
      bus.broadcast(Protocols.STATUS_REPORT, payload)
      statusBroadcastOnce = true
    }
  }

  if (runtimeConfig.enableComms) {
    if (runtimeConfig.useSocketComms !== false) wireTransport(typedSocket, bus)
    wireBeliefCoordination(bus, beliefs, {
      peerClaimTtlMs: runtimeConfig.peerClaimTtlMs,
    })

    bus.on("inbound", ({ from, name, payload }) => {
      if (logger.log)
        logger.log("[comms] from", name ?? from, JSON.stringify(payload))
    })

    bus.on(Protocols.ASSIGN_TASK, ({ targetId, command }) => {
      // console.log(
      //   "[coord] received ASSIGN_TASK",
      //   command?.type,
      //   "targetId:",
      //   targetId,
      //   "my id:",
      //   beliefs.me?.id
      // )
      const addressedToSomeoneElse = Boolean(
        targetId && beliefs.me && targetId !== beliefs.me.id
      )
      if (addressedToSomeoneElse) return
      if (!command) return
      try {
        const result = applyUserCommand(command, beliefs, intentionQueue)
        // console.log(
        //   "[coord] result:",
        //   result.applied,
        //   result.reason,
        //   result.text ?? ""
        // )
        if (result.applied) {
          logger.log?.("[coord] applied", command.type, "->", result.reason)
          beliefs.emit(BeliefEvents.CHANGED, { type: "assigned" })
          return
        }
        logger.warn?.(
          "[coord] ignored",
          command.type,
          "->",
          result.reason,
          result.text ?? ""
        )
      } catch (error) {
        logger.warn?.("[coord] assignment rejected:", errorMessage(error))
      }
    })
  }

  const statusTimer = setInterval(
    reportStatus,
    runtimeConfig.statusReportIntervalMs
  )
  statusTimer.unref?.()

  let loopRunning = false
  let claimedParcelId = null
  let consecutiveFailures = 0

  /** Generate options, pick best, revise intention queue. Returns active intention or null. */
  function deliberate() {
    if (beliefs.strategy.paused) return intentionQueue.current()
    if (!beliefs.strategy.lockedCapacity)
      beliefs.strategy.carryCapacity = estimateCarryCapacity(
        beliefs,
        runtimeConfig
      )
    const options = generateOptions(beliefs, runtimeConfig)
    const selection = selectBestOption(options, beliefs)
    return intentionQueue.revise(selection)
  }

  /** True when deliberation switches to a different intention than `activeIntention`. */
  function reconsider(activeIntention) {
    if (!runtimeConfig.reconsiderEveryStep) return false
    const current = deliberate()
    return !current || !current.samePredicate(activeIntention)
  }

  /** Broadcast claim/release messages to peer when pickup target changes. */
  function announceClaim(intention) {
    if (!runtimeConfig.enableComms) return
    const predicate = intention?.predicate
    const isPickup = predicate?.type === "pickup"
    const parcelId = isPickup ? (predicate.parcelId ?? null) : null
    if (parcelId === claimedParcelId) return
    if (claimedParcelId && peerAgentId)
      bus.tell(peerAgentId, Protocols.RELEASE_INTENTION, {
        parcelId: claimedParcelId,
      })
    if (parcelId && peerAgentId)
      bus.tell(peerAgentId, Protocols.CLAIM_INTENTION, {
        parcelId,
        agentId: beliefs.me?.id,
      })
    claimedParcelId = parcelId
  }

  /** Main BDI loop: deliberate, select plan, execute, handle failures. */
  async function runBdiLoop() {
    if (loopRunning || !beliefs.me || beliefs.strategy.paused) return
    loopRunning = true
    try {
      for (let cycle = 0; cycle < MAX_BDI_CYCLES; cycle++) {
        const intention = deliberate()
        if (!intention) break
        const plan = plans.select(intention)
        if (!plan) {
          intentionQueue.dropCurrent()
          break
        }
        intention.markRunning()
        announceClaim(intention)
        try {
          await plan.execute(intention, {
            beliefs,
            actions: actionAdapter,
            config: runtimeConfig,
            planner: externalPlanner,
            reconsider: () => reconsider(intention),
          })
          intentionQueue.completeCurrent()
          consecutiveFailures = 0
        } catch (error) {
          const planError = /** @type {any} */ (error)
          consecutiveFailures++
          if (planError.reconsidered) {
            consecutiveFailures = 0
            continue
          }
          if (!planError.recoverable) intentionQueue.dropCurrent()
          if (consecutiveFailures >= runtimeConfig.maxRetries) {
            intentionQueue.dropCurrent()
            consecutiveFailures = 0
            logger.warn?.("[BDI] cooling down — stuck")
            await new Promise((r) => setTimeout(r, 1500))
          }
          logger.warn?.("[BDI] plan interrupted", {
            intention: intention.predicate,
            reason: errorMessage(error),
          })
          break
        }
      }
    } finally {
      loopRunning = false
    }
  }

  // Trigger BDI loop on every belief change when autoRun is enabled.
  if (autoRun) {
    beliefs.on(BeliefEvents.CHANGED, () => {
      runBdiLoop().catch((error) => {
        logger.error?.("[BDI] loop error", error)
      })
    })
  }

  return {
    socket,
    beliefs,
    intentions: intentionQueue,
    plans,
    planner: externalPlanner,
    bus,
    actions: actionAdapter,
    config: runtimeConfig,
    deliberate,
    reconsider,
    runBdiLoop,
  }
}
