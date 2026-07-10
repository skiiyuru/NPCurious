import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk"
import { createBdiAgent } from "./src/agent.js"
import { config } from "./src/config.js"
import { quietLogger } from "./src/utils/log.js"

/** @type {import('./src/types.js').Socket} */
const socket = /** @type {any} */ (DjsConnect(config.host, config.token))

if (typeof socket.onConnect === "function") {
  socket.onConnect(() => {
    console.log("[agentA] connected to server")
  })
}

if (typeof socket.onDisconnect === "function") {
  socket.onDisconnect(() => {
    console.warn("[agentA] disconnected from server")
  })
}

export const agent = createBdiAgent({
  socket,
  config: {
    ...config,
    enableComms: true,
    useSocketComms: true,
    usePlanner: false,
  },
  logger: quietLogger,
})

console.log(`[agentA] connecting to ${config.host} as ${config.name}`)
