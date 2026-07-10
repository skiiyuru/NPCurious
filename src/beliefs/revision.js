/**
 * Pure belief-revision functions: update belief store and emit semantic events.
 * Each takes `beliefs` (state) and `emitter` (event bus) as first two args for testability.
 */

import { BeliefEvents } from "./events.js"
import { key } from "./queries.js"
import { manhattan } from "../utils/distance.js"
import { bayesNotSeen } from "../utils/belief.js"

// Tiles stay marked impassable for this long after a failed move or agent occupancy.
const TRANSIENT_BLOCK_TTL_MS = 1500

// Near-certain confidence for directly-sensed parcels. <1 so decay can still lower it;
// bayesNotSeen(1, p)===1 for any p — an exact-1 prior is absorbing and can never decay.
const SENSED_CONFIDENCE = 0.99

/**
 * Record server game config; derives real carry capacity and sensing range.
 * Tolerates IOConfig wrapper (`{ GAME: { player } }`) or raw game options (`{ player }`).
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {any} config
 */
export function reviseConfig(beliefs, emitter, config) {
  if (!config || typeof config !== "object") return
  beliefs.gameConfig = config
  const player = config.player ?? config.GAME?.player ?? {}
  const capacity = player.capacity
  const observation = player.observation_distance
  if (typeof capacity === "number" && capacity > 0)
    beliefs.strategy.serverCapacity = capacity
  if (typeof observation === "number" && observation > 0)
    beliefs.strategy.sensingRange = observation
  emitter.emit(BeliefEvents.CHANGED, { type: "config" })
}

/**
 * Revise self belief from a `you` percept.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {string} id
 * @param {string} name
 * @param {number} x
 * @param {number} y
 * @param {number} [score=0]
 */
export function reviseYou(beliefs, emitter, id, name, x, y, score = 0) {
  beliefs.me = { id, name, x, y, score }
  emitter.emit(BeliefEvents.ME_UPDATED, beliefs.me)
  emitter.emit(BeliefEvents.CHANGED, { type: "you" })
}

/**
 * Revise map dimensions and all tiles from a map percept.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {number} width
 * @param {number} height
 * @param {import('../types.js').Tile[]} [tiles=[]]
 */
export function reviseMap(beliefs, emitter, width, height, tiles = []) {
  beliefs.map = { width, height }
  for (const tile of tiles) {
    reviseTile(beliefs, emitter, tile)
  }
  emitter.emit(BeliefEvents.MAP_UPDATED, beliefs.map)
  emitter.emit(BeliefEvents.CHANGED, { type: "map" })
}

/**
 * Revise a single tile; registers delivery zones on first discovery.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {import('../types.js').Tile} tile
 */
export function reviseTile(beliefs, emitter, tile) {
  beliefs.tiles.set(key(tile.x ?? 0, tile.y ?? 0), tile)

  const isDeliveryTile = tile.delivery || tile.type === "2"
  if (isDeliveryTile) {
    const alreadyRegistered = beliefs.deliveryZones.some(
      (/** @type {import('../types.js').Position} */ zone) =>
        zone.x === tile.x && zone.y === tile.y
    )
    if (!alreadyRegistered) {
      beliefs.deliveryZones.push({ x: tile.x ?? 0, y: tile.y ?? 0 })
    }
  }

  emitter.emit(BeliefEvents.TILE_UPDATED, tile)
}

/**
 * Revise parcel beliefs from a parcelsSensing percept using Bayesian confidence updates.
 * Visible → high confidence; invisible within range → revised down; out-of-range → time decay.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {import('../types.js').Parcel[]} [parcels=[]]
 */
export function reviseParcels(beliefs, emitter, parcels = []) {
  const seenIds = new Set(parcels.map((parcel) => parcel.id))
  updateVisibleParcels(beliefs, emitter, parcels)
  reviseRememberedParcels(beliefs, emitter, seenIds)
  emitter.emit(BeliefEvents.CHANGED, { type: "parcels" })
}

/**
 * Update visible parcels with high confidence and emit per-parcel semantic events.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {import('../types.js').Parcel[]} parcels
 */
function updateVisibleParcels(beliefs, emitter, parcels) {
  for (const parcel of parcels) {
    const previous = beliefs.parcels.get(parcel.id ?? "")
    const revised = {
      ...previous,
      ...parcel,
      confidence: SENSED_CONFIDENCE,
      lastSeenAt: Date.now(),
    }

    beliefs.parcels.set(parcel.id ?? "", revised)

    const isNewParcel = !previous
    const wasJustPickedUp = previous && !previous.carriedBy && parcel.carriedBy
    if (isNewParcel) {
      emitter.emit(BeliefEvents.PARCEL_APPEARED, revised)
    } else if (wasJustPickedUp) {
      emitter.emit(BeliefEvents.PARCEL_TAKEN, revised)
    } else {
      emitter.emit(BeliefEvents.PARCEL_UPDATED, revised)
    }
  }
}

/**
 * Decay or drop remembered parcels not seen this tick.
 * Within sensing range: Bayesian belief revision (sharp drop).
 * Out of range: exponential time decay.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {Set<any>} seenIds
 */
function reviseRememberedParcels(beliefs, emitter, seenIds) {
  const sensingRange = beliefs.strategy?.sensingRange ?? Infinity
  const missProbability = beliefs.strategy?.sensorMissProbability ?? 0.2
  const lambdaTime = beliefs.strategy?.lambdaTimeDecay ?? 0.03

  for (const [id, parcel] of beliefs.parcels) {
    if (seenIds.has(id) || parcel.carriedBy === beliefs.me?.id) continue

    const prior = parcel.confidence ?? 1
    const parcelPosition = /** @type {import('../types.js').Position} */ (
      parcel
    )
    const withinSensing =
      Boolean(beliefs.me) &&
      manhattan(beliefs.me, parcelPosition) <= sensingRange

    let confidence
    if (withinSensing) {
      // Belief revision (K&M): parcel should be visible but isn't — sharply lower confidence.
      confidence = bayesNotSeen(prior, missProbability)
    } else {
      // Belief update: out of range, only time erodes confidence.
      const ageSeconds = (Date.now() - (parcel.lastSeenAt ?? Date.now())) / 1000
      confidence = Math.max(0, prior * Math.exp(-lambdaTime * ageSeconds))
    }

    beliefs.parcels.set(id, { ...parcel, confidence })
    if (confidence < 0.05) emitter.emit(BeliefEvents.PARCEL_GONE, parcel)
  }
}

/**
 * Revise other-agent beliefs from an agentsSensing percept; marks occupied tiles transiently blocked.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {import('../types.js').SensedAgent[]} [agents=[]]
 */
export function reviseAgents(beliefs, emitter, agents = []) {
  for (const agent of agents) {
    if (agent.id === beliefs.me?.id) continue
    const revised = { ...agent, lastSeenAt: Date.now() }
    beliefs.agents.set(agent.id ?? "", revised)
    if (typeof agent.x === "number" && typeof agent.y === "number") {
      beliefs.transientBlocks.set(
        key(agent.x, agent.y),
        Date.now() + TRANSIENT_BLOCK_TTL_MS
      )
    }
    emitter.emit(BeliefEvents.AGENT_UPDATED, revised)
  }
  emitter.emit(BeliefEvents.CHANGED, { type: "agents" })
}

/**
 * Record a peer's parcel claim so option generation yields that parcel to them.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {string} parcelId
 * @param {string} agentId
 * @param {number} [at]
 */
export function notePeerClaim(
  beliefs,
  emitter,
  parcelId,
  agentId,
  at = Date.now()
) {
  if (!parcelId || agentId === beliefs.me?.id) return
  beliefs.peerClaims.set(parcelId, { agentId, at })
  emitter.emit(BeliefEvents.CHANGED, { type: "peer-claim" })
}

/**
 * Remove a peer's parcel claim; emits CHANGED when a claim was actually removed.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {string} parcelId
 */
export function clearPeerClaim(beliefs, emitter, parcelId) {
  if (beliefs.peerClaims.delete(parcelId)) {
    emitter.emit(BeliefEvents.CHANGED, { type: "peer-release" })
  }
}

/**
 * Drop peer claims older than `ttlMs`; called periodically as housekeeping.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {number} ttlMs
 */
export function expirePeerClaims(beliefs, ttlMs) {
  const now = Date.now()
  for (const [parcelId, claim] of beliefs.peerClaims) {
    if (now - claim.at > ttlMs) beliefs.peerClaims.delete(parcelId)
  }
}

/**
 * Mark tile as transiently blocked after a failed move; triggers A* replanning.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Beliefs} emitter
 * @param {number} x
 * @param {number} y
 * @param {number} [ttlMs]
 */
export function markBlocked(
  beliefs,
  emitter,
  x,
  y,
  ttlMs = TRANSIENT_BLOCK_TTL_MS
) {
  beliefs.transientBlocks.set(key(x, y), Date.now() + ttlMs)
  emitter.emit(BeliefEvents.TILE_UPDATED, { x, y })
  emitter.emit(BeliefEvents.CHANGED, { type: "tile-blocked" })
}
