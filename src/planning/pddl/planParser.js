/**
 * Convert solver output into ordered Deliveroo move directions.
 * Tolerates: `(move c0_0 c1_0 right)` or `(move-right c0_0 c1_0)`;
 * accepts arrays of steps (strings or {action}/{name} objects) or a multi-line plan string.
 */

const DIRECTIONS = ["right", "left", "up", "down"]

/**
 * Normalize one step to its action string ('' for unknown shapes).
 * @param {string | Object} step
 * @returns {string}
 */
function stepToString(step) {
  if (typeof step === "string") return step
  if (step && typeof step === "object") {
    const s = /** @type {{ action?: string, name?: string }} */ (step)
    return s.action ?? s.name ?? ""
  }
  return ""
}

/**
 * Strip surrounding parens: `"(move a b right)"` → `"move a b right"`.
 * @param {string} text
 * @returns {string}
 */
function stripSurroundingParens(text) {
  let result = text
  while (result.startsWith("(")) result = result.slice(1)
  while (result.endsWith(")")) result = result.slice(0, -1)
  return result
}

/**
 * Parse plan into move directions. [] when already at goal; null when no move action found.
 * @param {string[] | Object[] | string | null | undefined} plan
 * @returns {string[] | null}
 */
export function parsePlan(plan) {
  if (plan == null) return null

  let rawLines
  if (Array.isArray(plan)) {
    rawLines = plan.map(stepToString)
  } else {
    rawLines = String(plan).split("\n")
  }

  const lines = rawLines.map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const directions = []
  let sawMove = false

  for (const raw of lines) {
    const line = stripSurroundingParens(raw).trim()
    if (line.startsWith(";")) continue // solver comment

    const tokens = line.split(/\s+/)
    const head = tokens[0]?.toLowerCase()

    if (head === "move") {
      sawMove = true
      const dir = tokens[tokens.length - 1]?.toLowerCase()
      if (dir && DIRECTIONS.includes(dir)) directions.push(dir)
    } else if (head?.startsWith("move-")) {
      sawMove = true
      const dir = head.slice("move-".length)
      if (DIRECTIONS.includes(dir)) directions.push(dir)
    }
  }

  return sawMove ? directions : null
}
