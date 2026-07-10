import { Protocols } from "./protocols.js"

/**
 * Decode inbound socket message body; already-object passes through, strings are JSON-parsed,
 * unparseable strings wrapped as `{ text: message }`.
 * @param {string | Record<string, *>} message
 * @returns {Record<string, *>}
 */
function safeParse(message) {
  if (message && typeof message === "object")
    return /** @type {Record<string, *>} */ (message)
  try {
    return JSON.parse(/** @type {string} */ (message))
  } catch {
    return { text: message }
  }
}

/**
 * Socket ↔ bus transport: inbound socket messages → bus events; outbound bus events → `emitShout`/`emitSay`.
 * @param {import('../types.js').Socket} socket
 * @param {import('../types.js').MessageBus} bus
 * @returns {import('../types.js').MessageBus}
 */
export function wireTransport(socket, bus) {
  function handleInbound(
    /** @type {string} */ id,
    /** @type {string} */ name,
    /** @type {string | Object} */ msg
  ) {
    const payload = safeParse(msg)
    bus.emit("inbound", { from: id, name, payload })
    if (payload && payload.protocol) {
      bus.emit(payload.protocol, { from: id, name, ...payload })
    }
  }

  function handleOutbound(
    /** @type {{ to: string | null, payload: Object }} */ { to, payload }
  ) {
    const body = JSON.stringify(payload)
    if (to && typeof socket?.emitSay === "function") {
      socket.emitSay(to, body)
    } else if (typeof socket?.emitShout === "function") {
      socket.emitShout(body)
    }
  }

  if (socket && typeof socket.onMsg === "function") {
    socket.onMsg(handleInbound)
  }
  bus.on("outbound", handleOutbound)

  return bus
}

/**
 * Wire belief-level coordination: peer parcel claims, shared sightings, and optional claim expiry.
 * @param {import('../types.js').MessageBus} bus
 * @param {import('../types.js').Beliefs} beliefs
 * @param {{ peerClaimTtlMs?: number }} [options]
 * @returns {import('../types.js').MessageBus}
 */
export function wireBeliefCoordination(bus, beliefs, { peerClaimTtlMs } = {}) {
  bus.on(
    Protocols.CLAIM_INTENTION,
    (/** @type {{ from: string, parcelId: string }} */ { from, parcelId }) => {
      if (parcelId) beliefs.notePeerClaim(parcelId, from)
    }
  )
  bus.on(
    Protocols.RELEASE_INTENTION,
    (/** @type {{ parcelId: string }} */ { parcelId }) => {
      if (parcelId) beliefs.clearPeerClaim(parcelId)
    }
  )
  bus.on(
    Protocols.SHARE_BELIEFS,
    (
      /** @type {{ parcels: import('../types.js').Parcel[] }} */ { parcels }
    ) => {
      if (Array.isArray(parcels) && parcels.length)
        beliefs.reviseParcels(parcels)
    }
  )

  if (peerClaimTtlMs && typeof beliefs.expirePeerClaims === "function") {
    const timer = setInterval(
      () => beliefs.expirePeerClaims(peerClaimTtlMs),
      peerClaimTtlMs
    )
    timer.unref?.() // Don't keep Node process alive.
  }

  return bus
}

/**
 * Convenience: `wireTransport` + `wireBeliefCoordination` in one call.
 * @param {import('../types.js').Socket} socket
 * @param {import('../types.js').MessageBus} bus
 * @param {import('../types.js').Beliefs} beliefs
 * @param {{ peerClaimTtlMs?: number }} [options]
 * @returns {import('../types.js').MessageBus}
 */
export function wireComms(socket, bus, beliefs, { peerClaimTtlMs } = {}) {
  wireTransport(socket, bus)
  wireBeliefCoordination(bus, beliefs, { peerClaimTtlMs })
  return bus
}
