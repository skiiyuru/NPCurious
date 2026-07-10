/**
 * Pure read-only query helpers for the belief base. Each takes `beliefs` as first arg for testability.
 */

import { manhattan } from "../utils/distance.js"
import { travelCost } from "../utils/travel.js"

// One-way tiles: entry from the side opposite the arrow is forbidden.
// Vector = allowed travel direction (up:y+1, down:y-1, right:x+1, left:x-1).
/** @type {Record<string, { dx: number, dy: number }>} */
const DIRECTION_VECTORS = {
  "↑": { dx: 0, dy: 1 },
  "→": { dx: 1, dy: 0 },
  "↓": { dx: 0, dy: -1 },
  "←": { dx: -1, dy: 0 },
}

/**
 * Canonical tile-map key for (x, y).
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
export function key(x, y) {
  return `${x},${y}`
}

/**
 * Uncarried parcels.
 * @param {import('../types.js').Beliefs} beliefs
 * @returns {import('../types.js').Parcel[]}
 */
export function getFreeParcels(beliefs) {
  return [...beliefs.parcels.values()].filter((parcel) => !parcel.carriedBy)
}

/**
 * Parcels carried by this agent.
 * @param {import('../types.js').Beliefs} beliefs
 * @returns {import('../types.js').Parcel[]}
 */
export function getCarriedParcels(beliefs) {
  return [...beliefs.parcels.values()].filter(
    (parcel) => parcel.carriedBy === beliefs.me?.id
  )
}

/**
 * Nearest delivery zone by real path cost; prefers walkable zones, falls back to cheapest overall.
 * Respects preferredDeliveryZones / blockedDeliveryZones strategy constraints.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Position} [from]
 * @param {(a: import('../types.js').Position|null|undefined, b: import('../types.js').Position|null|undefined) => number} [cost]
 * @returns {import('../types.js').Position | null}
 */
export function getNearestDeliveryZone(
  beliefs,
  from = beliefs.me ?? undefined,
  cost
) {
  if (!from || beliefs.deliveryZones.length === 0) return null

  const constraints = beliefs.strategy?.constraints ?? {}
  const whitelist = constraints.preferredDeliveryZones
  const blacklist = constraints.blockedDeliveryZones
  let zones = beliefs.deliveryZones
  if (Array.isArray(whitelist) && whitelist.length > 0)
    zones = zones.filter((z) =>
      whitelist.some((w) => w.x === z.x && w.y === z.y)
    )
  if (Array.isArray(blacklist) && blacklist.length > 0)
    zones = zones.filter(
      (z) => !blacklist.some((b) => b.x === z.x && b.y === z.y)
    )
  if (zones.length === 0) return null

  const measure =
    cost ??
    ((/** @type {any} */ a, /** @type {any} */ b) => travelCost(beliefs, a, b))
  const ranked = zones.map((zone) => ({ zone, distance: measure(from, zone) }))
  ranked.sort((a, b) => a.distance - b.distance)

  const reachable = ranked.find(
    (r) => Number.isFinite(r.distance) && beliefs.isWalkable(r.zone.x, r.zone.y)
  )
  return (reachable ?? ranked[0]).zone
}

/**
 * True when tile is a known wall (type '0').
 * @param {import('../types.js').Beliefs} beliefs
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isObstacleAt(beliefs, x, y) {
  const tile = beliefs.tiles.get(key(x, y))
  return tile != null && tile.type === "0"
}

/**
 * True while tile has an unexpired transient block (agent occupying it or recent failed move).
 * @param {import('../types.js').Beliefs} beliefs
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isTransientlyBlocked(beliefs, x, y) {
  const blockedUntil = beliefs.transientBlocks?.get(key(x, y))
  if (blockedUntil === undefined) return false
  if (blockedUntil > Date.now()) return true
  beliefs.transientBlocks.delete(key(x, y))
  return false
}

/**
 * True when tile is known and not a wall — ignores transient blocks and avoid-constraints.
 * Use to validate user move targets before committing.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isKnownWalkable(beliefs, x, y) {
  const tile = beliefs.tiles.get(key(x, y))
  return tile != null && tile.type !== "0"
}

/**
 * True when A* may route through tile (known, non-wall, not avoid-listed, no active transient block).
 * @param {import('../types.js').Beliefs} beliefs
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isWalkable(beliefs, x, y) {
  const tile = beliefs.tiles.get(key(x, y))
  const avoidTiles = beliefs.strategy?.constraints?.avoidTiles ?? []
  if (
    avoidTiles.some(
      (/** @type {import('../types.js').Position} */ avoid) =>
        avoid.x === x && avoid.y === y
    )
  )
    return false

  const blockedUntil = beliefs.transientBlocks?.get(key(x, y))
  if (blockedUntil !== undefined) {
    if (blockedUntil > Date.now()) return false
    beliefs.transientBlocks.delete(key(x, y))
  }

  return tile != null && tile.type !== "0"
}

/**
 * True unless destination is a one-way tile entered against its arrow.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @returns {boolean}
 */
export function canEnterFrom(beliefs, fromX, fromY, toX, toY) {
  const destinationType = beliefs.tiles.get(key(toX, toY))?.type ?? ""
  const vector = DIRECTION_VECTORS[destinationType]
  if (!vector) return true
  const steppingAgainstArrow =
    toX - fromX === -vector.dx && toY - fromY === -vector.dy
  return !steppingAgainstArrow
}

/**
 * Manhattan distance from our agent to another sensed agent; Infinity when position unknown.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {string} id
 * @returns {number}
 */
export function getAgentDistance(beliefs, id) {
  const agent = beliefs.agents.get(id)
  if (!agent || !beliefs.me) return Infinity
  return manhattan(
    /** @type {import('../types.js').Position} */ (beliefs.me),
    /** @type {import('../types.js').Position} */ (agent)
  )
}

/**
 * True when a fresh non-self claim exists for this parcel. Lazily prunes stale claims.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {string} parcelId
 * @param {number} [ttlMs=10000]
 * @returns {boolean}
 */
export function isParcelClaimedByPeer(beliefs, parcelId, ttlMs = 10000) {
  const claim = beliefs.peerClaims.get(parcelId)
  if (!claim) return false
  if (Date.now() - claim.at > ttlMs) {
    beliefs.peerClaims.delete(parcelId)
    return false
  }
  return claim.agentId !== beliefs.me?.id
}

/**
 * Manhattan distance of the nearest competitor agent to `target`; Infinity when none known.
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Position} target
 * @returns {number}
 */
export function getNearestAgentDistanceTo(beliefs, target) {
  let nearest = Infinity
  for (const agent of beliefs.agents.values()) {
    if (agent.id === beliefs.me?.id) continue
    const distance = manhattan(
      /** @type {import('../types.js').Position} */ (agent),
      target
    )
    if (distance < nearest) nearest = distance
  }
  return nearest
}
