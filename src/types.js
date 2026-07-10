// Shared JSDoc type definitions for the whole project.

export {}

/**
 * A grid coordinate.
 * @typedef {Object} Position
 * @property {number} x
 * @property {number} y
 */

/**
 * A parcel as sensed from the server or remembered in beliefs.
 * @typedef {Object} Parcel
 * @property {string} [id]
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [reward]
 * @property {string|null} [carriedBy]
 * @property {number} [confidence]
 * @property {number} [lastSeenAt]
 * @property {*} [key]
 */

/**
 * A map tile.
 * @typedef {Object} Tile
 * @property {number} [x]
 * @property {number} [y]
 * @property {string} [type]
 * @property {boolean} [delivery]
 * @property {*} [key]
 */

/**
 * Another agent sensed on the map.
 * @typedef {Object} SensedAgent
 * @property {string} [id]
 * @property {string} [name]
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [lastSeenAt]
 * @property {*} [key]
 */

/**
 * This agent's own latest self-percept.
 * @typedef {Object} Self
 * @property {string} id
 * @property {string} [name]
 * @property {number} x
 * @property {number} y
 * @property {number} [score]
 * @property {*} [key]
 */

/**
 * A desire/option produced by option generation, or the predicate of an intention.
 * `type` is 'pickup', 'deliver', or 'explore'; remaining fields depend on the type.
 * @typedef {Object} Option
 * @property {string} type
 * @property {string} [parcelId]
 * @property {string[]} [parcelIds]
 * @property {Position} [target]
 * @property {number} [reward]
 * @property {number} [estimatedEV]
 * @property {string} [reason]
 * @property {*} [key]
 */

/**
 * A structured command the LLM layer produces and the BDI executor applies.
 * @typedef {Object} Command
 * @property {string} type
 * @property {Option} [intention]
 * @property {Object<string, *>} [policy]
 * @property {Object<string, *>} [constraint]
 * @property {string} [text]
 * @property {Position} [target]
 */

/**
 * Agent A's broadcast of its current position, load, and goal (consumed by Agent B).
 * @typedef {Object} StatusReport
 * @property {string} [agentId]
 * @property {string} [name]
 * @property {number} [x]
 * @property {number} [y]
 * @property {string[]} [carrying]
 * @property {Option|null} [intention]
 * @property {*} [key]
 */

/**
 * One parsed reply from the coordinator's iterative tool loop: either a tool invocation the loop
 * should execute and observe, or a `final` summary that ends the mission.
 * @typedef {Object} ToolCall
 * @property {string} [tool]
 * @property {Object<string, *>} [args]
 * @property {string} [final]
 */

/**
 * One callable capability in Agent B's tool catalog, wrapping a BDI ability or the team channel.
 * @typedef {Object} Tool
 * @property {string} name
 * @property {string} args
 * @property {string} description
 * @property {(args: Object<string, *>) => string} execute
 */

/**
 * Runtime strategy/configuration knobs. Documented loosely because callers merge arbitrary keys.
 * @typedef {Object<string, *>} Config
 */

/**
 * Minimal logger surface (satisfied by `console` or a no-op test stub).
 * @typedef {Object} Logger
 * @property {(...args: any[]) => void} [log]
 * @property {(...args: any[]) => void} [warn]
 * @property {(...args: any[]) => void} [error]
 */

/**
 * The Deliveroo socket surface this project uses. All methods are optional because the lab SDK
 * varies and call sites probe defensively before using them.
 * @typedef {Object} Socket
 * @property {(event: string, handler: Function) => void} [on]
 * @property {(handler: Function) => void} [onMsg]
 * @property {(handler: Function) => void} [onConnect]
 * @property {(handler: Function) => void} [onDisconnect]
 * @property {(body: string) => void} [emitShout]
 * @property {(to: string, body: string) => void} [emitSay]
 * @property {(direction: string) => any} [emitMove]
 * @property {() => any} [emitPickup]
 * @property {(parcelIds?: string[]) => any} [emitPutdown]
 * @property {*} [key]
 */

/**
 * @typedef {import('./beliefs/BeliefBase.js').BeliefBase} Beliefs
 */

/**
 * @typedef {import('./comms/MessageBus.js').MessageBus} MessageBus
 */

/**
 * @typedef {import('./intentions/IntentionQueue.js').IntentionQueue} IntentionQueue
 */

/**
 * @typedef {import('./llm/client.js').LLMClient} LLMClient
 */
