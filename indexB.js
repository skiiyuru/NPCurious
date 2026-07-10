import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk"
import { createBdiAgent } from "./src/agent.js"
import { LLMClient } from "./src/llm/client.js"
import { attachCoordinator } from "./src/agentB/coordinator.js"
import { readLines } from "./src/utils/readLines.js"
import { config } from "./src/config.js"
import { quietLogger } from "./src/utils/log.js"

/** @type {import('./src/types.js').Socket} */
const socket = /** @type {any} */ (
  DjsConnect(config.host, config.tokenB ?? config.token)
)

export const agentB = createBdiAgent({
  socket,
  config: {
    ...config,
    enableComms: true,
    useSocketComms: true,
    usePlanner: false,
  },
  logger: quietLogger,
})

const client = new LLMClient({
  baseURL: config.llmBaseURL,
  apiKey: config.llmApiKey,
  model: config.llmModel,
  logger: quietLogger,
})

export const coordinator = attachCoordinator(agentB, {
  client,
  logger: quietLogger,
  maxSteps: 15,
})

// Local mission input: each stdin line runs through the same tool loop as the gamee chat.
// FOR debug purposes
// readLines(process.stdin, (line) => {
//   coordinator.runMission(line, { name: 'operator' }).catch((error) => {
//     console.warn('[agentB] mission failed:', error?.message ?? error);
//   });
// });

if (typeof socket.onConnect === "function") {
  socket.onConnect(() => console.log("[agentB] connected as LLM agent"))
}

if (typeof socket.onDisconnect === "function") {
  socket.onDisconnect(() => console.warn("[agentB] disconnected from server"))
}

// console.log(`[agentB] connecting to ${config.host} as LLM agent`)
