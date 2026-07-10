import { EventEmitter } from "node:events"

/**
 * Lightweight event bus. Inbound socket messages → protocol events; outbound messages → socket via wiring layer.
 */
export class MessageBus extends EventEmitter {
  /**
   * Fan out a parsed inbound message to its protocol handlers.
   * @param {string} type
   * @param {*} payload
   */
  send(type, payload) {
    this.emit(type, payload)
  }

  /**
   * Emit outbound broadcast; wiring layer calls `emitShout` on all peers.
   * @param {string} protocol
   * @param {Object<string, *>} [data]
   */
  broadcast(protocol, data = {}) {
    this.emit("outbound", { to: null, payload: { protocol, ...data } })
  }

  /**
   * Emit outbound directed message; wiring layer calls `emitSay` to one peer.
   * @param {string} to - Recipient agent id.
   * @param {string} protocol
   * @param {Object<string, *>} [data]
   */
  tell(to, protocol, data = {}) {
    this.emit("outbound", { to, payload: { protocol, ...data } })
  }
}
