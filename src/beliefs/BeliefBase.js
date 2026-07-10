/**
 * Stateful belief container (B in BDI). Extends EventEmitter for reactive deliberation.
 * Thin facade: mutations → revision module, reads → queries module.
 */

import { EventEmitter } from "node:events"
import * as revision from "./revision.js"
import * as queries from "./queries.js"

/** @typedef {import('../types.js').Self} Self */
/** @typedef {import('../types.js').Tile} Tile */
/** @typedef {import('../types.js').Parcel} Parcel */
/** @typedef {import('../types.js').SensedAgent} SensedAgent */
/** @typedef {import('../types.js').Position} Position */
/** @typedef {import('../types.js').Config} Config */

export class BeliefBase extends EventEmitter {
  constructor() {
    super()
    /** @type {Self | null} */
    this.me = null
    this.map = { width: 0, height: 0 }
    /** @type {Map<string, Tile>} */
    this.tiles = new Map()
    /** @type {Map<string, Parcel>} */
    this.parcels = new Map()
    /** @type {Map<string, SensedAgent>} */
    this.agents = new Map()
    /** @type {Position[]} */
    this.deliveryZones = []
    /** @type {Map<string, {agentId: string, at: number}>} */
    this.peerClaims = new Map()
    /** @type {Map<string, number>} */
    this.transientBlocks = new Map()
    /** @type {Config} */
    this.strategy = { carryCapacity: 3 }
    /** @type {any} */
    this.gameConfig = null
  }

  /**
   * @param {string} id
   * @param {string} name
   * @param {number} x
   * @param {number} y
   * @param {number} [score=0]
   */
  reviseYou(id, name, x, y, score = 0) {
    return revision.reviseYou(this, this, id, name, x, y, score)
  }

  /** @param {any} config */
  reviseConfig(config) {
    return revision.reviseConfig(this, this, config)
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {Tile[]} [tiles=[]]
   */
  reviseMap(width, height, tiles = []) {
    return revision.reviseMap(this, this, width, height, tiles)
  }

  /** @param {Tile} tile */
  reviseTile(tile) {
    return revision.reviseTile(this, this, tile)
  }

  /** @param {Parcel[]} [parcels=[]] */
  reviseParcels(parcels = []) {
    return revision.reviseParcels(this, this, parcels)
  }

  /** @param {SensedAgent[]} [agents=[]] */
  reviseAgents(agents = []) {
    return revision.reviseAgents(this, this, agents)
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  markBlocked(x, y) {
    return revision.markBlocked(this, this, x, y)
  }

  /** @returns {Parcel[]} */
  getFreeParcels() {
    return queries.getFreeParcels(this)
  }

  /** @returns {Parcel[]} */
  getCarriedParcels() {
    return queries.getCarriedParcels(this)
  }

  /**
   * @param {Position} [from]
   * @param {(a: Position|null|undefined, b: Position|null|undefined) => number} [cost]
   * @returns {Position | null}
   */
  getNearestDeliveryZone(from = this.me ?? undefined, cost) {
    return queries.getNearestDeliveryZone(this, from, cost)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isObstacleAt(x, y) {
    return queries.isObstacleAt(this, x, y)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isTransientlyBlocked(x, y) {
    return queries.isTransientlyBlocked(this, x, y)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isKnownWalkable(x, y) {
    return queries.isKnownWalkable(this, x, y)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isWalkable(x, y) {
    return queries.isWalkable(this, x, y)
  }

  /**
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} toX
   * @param {number} toY
   * @returns {boolean}
   */
  canEnterFrom(fromX, fromY, toX, toY) {
    return queries.canEnterFrom(this, fromX, fromY, toX, toY)
  }

  /**
   * @param {string} id
   * @returns {number}
   */
  getAgentDistance(id) {
    return queries.getAgentDistance(this, id)
  }

  /**
   * @param {Position} target
   * @returns {number}
   */
  getNearestAgentDistanceTo(target) {
    return queries.getNearestAgentDistanceTo(this, target)
  }

  /**
   * @param {string} parcelId
   * @param {string} agentId
   * @param {number} [at]
   */
  notePeerClaim(parcelId, agentId, at = Date.now()) {
    return revision.notePeerClaim(this, this, parcelId, agentId, at)
  }

  /** @param {string} parcelId */
  clearPeerClaim(parcelId) {
    return revision.clearPeerClaim(this, this, parcelId)
  }

  /**
   * @param {string} parcelId
   * @param {number} [ttlMs]
   * @returns {boolean}
   */
  isParcelClaimedByPeer(parcelId, ttlMs) {
    return queries.isParcelClaimedByPeer(this, parcelId, ttlMs)
  }

  /** @param {number} ttlMs */
  expirePeerClaims(ttlMs) {
    return revision.expirePeerClaims(this, ttlMs)
  }
}
