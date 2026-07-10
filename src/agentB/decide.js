import { extractJsonObject } from "../llm/adapter.js"

/**
 * Parse one tool-loop turn from LLM raw reply.
 * Expects `{"tool": name, "args": {...}}` or `{"final": "<summary>"}`.
 * Throws descriptive Error on malformed output so the loop can retry.
 * @param {string} text
 * @returns {import('../types.js').ToolCall}
 */
export function parseToolCall(text) {
  const call = JSON.parse(extractJsonObject(text))
  if (!call || typeof call !== "object" || Array.isArray(call)) {
    throw new Error("Reply must be a single JSON object")
  }
  if (typeof call.final === "string") {
    return { final: call.final }
  }
  if (typeof call.tool !== "string" || call.tool.length === 0) {
    throw new Error('Reply must contain a "tool" name or a "final" summary')
  }
  const args = call.args ?? {}
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error('Tool "args" must be a JSON object')
  }
  return { tool: call.tool, args }
}
