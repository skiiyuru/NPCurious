/**
* This file acts as the internal communication system for the agent. 
 * Instead of having the agent's decision-making logic constantly nagging 
 * the memory with "Did anything change? Did anything change?" (polling), 
 * the memory uses this system to simply broadcast announcements over a 
 * loudspeaker whenever something actually happens. 
 * * CORE RESPONSIBILITY:
 * To broadcast specific "events" so that the rest of the agent's code 
 * (like deciding where to walk next) can react instantly without wasting 
 * processing power constantly checking for updates.
 * * THE ANNOUNCEMENTS (Events Emitted):
 * - parcel-appeared : "Hey! I just spotted a brand new package!"
 * - parcel-taken    : "Darn, someone else just grabbed a package."
 * - parcel-gone     : "That package vanished (it expired or I walked too far away)."
 * - parcel-changed  : "That package just moved or its reward value dropped."
 * - agent-moved     : "Watch out, another player just moved to a new spot."
 * - carry-changed   : "A package just switched hands (picked up or dropped)."
 * - me-moved        : "I just successfully took a step to a new tile."
 */

export class BeliefEvents {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map()
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event).add(handler)
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    this._listeners.get(event)?.delete(handler)
  }

  /**
   * Emit an event with a payload.
   * @param {string} event
   * @param {any} payload
   */
  emit(event, payload) {
    for (const handler of this._listeners.get(event) ?? []) {
      try {
        handler(payload)
      } catch (err) {
        console.error(`[BeliefEvents] Handler error on "${event}":`, err)
      }
    }
  }
}
