/**
 * Online PDDL solver client (planning.domains PaaS API).
 * All failures resolve to null so ExternalPlanner falls back to local A*.
 *
 * API flow:
 *   1. POST {domain, problem} → {result: "/check/<id>"}
 *   2. Poll /check with backoff until plan is ready at result.output.sas_plan.
 */

const DEFAULT_ENDPOINT =
  "https://solver.planning.domains:5001/package/lama-first/solve"
const INITIAL_POLL_DELAY_MS = 500
const MAX_POLL_DELAY_MS = 2000

// Warn once when solver is unreachable — prevents silent A* fallback hiding dead endpoint.
let warnedUnavailable = false

/** @returns {null} */
function warnUnavailable() {
  if (!warnedUnavailable) {
    warnedUnavailable = true
    console.warn(
      "[planner] online PDDL solver unavailable — falling back to local A*"
    )
  }
  return null
}

/**
 * Extract plan steps from known response shapes:
 * result.output.sas_plan, result.plan (array or string), result.actions, result.output string.
 * @param {any} data
 * @returns {any[] | string | null}
 */
function extractPlanSteps(data) {
  if (!data || typeof data !== "object") return null

  const result = /** @type {any} */ (data).result ?? data
  if (!result || typeof result !== "object") return null

  const output = result.output
  if (output && typeof output === "object") {
    const sasPlan = output.sas_plan ?? output.plan
    if (typeof sasPlan === "string" && sasPlan.trim()) return sasPlan
  }

  if (Array.isArray(result.plan)) return result.plan
  if (typeof result.plan === "string") return result.plan
  if (Array.isArray(result.actions)) return result.actions
  if (typeof result.output === "string") return result.output
  return null
}

/**
 * Single JSON request bounded by deadline; null on any failure.
 * @param {string} url
 * @param {number} deadline - epoch ms after which request is aborted.
 * @param {RequestInit} [init]
 * @returns {Promise<any | null>}
 */
async function fetchJson(url, deadline, init = {}) {
  const budget = deadline - Date.now()
  if (budget <= 0) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), budget)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Submit (domain, problem) and poll for the plan; null on any failure.
 * @param {string} domain
 * @param {string} problem
 * @param {{ url?: string, timeoutMs?: number }} [options]
 * @returns {Promise<any[] | string | null>}
 */
export async function solveOnline(
  domain,
  problem,
  { url, timeoutMs = 10000 } = {}
) {
  const endpoint = url ?? DEFAULT_ENDPOINT
  const deadline = Date.now() + timeoutMs

  const submitted = await fetchJson(endpoint, deadline, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, problem }),
  })
  if (submitted == null) return warnUnavailable()

  // Synchronous solvers (tests, self-hosted) answer directly.
  const immediate = extractPlanSteps(submitted)
  if (immediate != null) return immediate

  // Async PaaS flow: submit reply carries a /check path to poll.
  const checkPath = /** @type {any} */ (submitted).result
  if (typeof checkPath !== "string") return warnUnavailable()

  /** @type {string} */
  let checkUrl
  try {
    checkUrl = new URL(checkPath, endpoint).toString()
  } catch {
    return warnUnavailable()
  }

  // Poll with exponential backoff until plan ready or deadline passes.
  let delay = INITIAL_POLL_DELAY_MS
  while (Date.now() + delay < deadline) {
    await sleep(delay)

    const data = await fetchJson(checkUrl, deadline)
    const steps = extractPlanSteps(data)
    if (steps != null) return steps

    // Finished job with no extractable steps = no plan found.
    const status = data && typeof data === "object" ? data.status : undefined
    const finished =
      typeof status === "string" && status.toLowerCase() !== "pending"
    if (finished) return null

    delay = Math.min(delay * 2, MAX_POLL_DELAY_MS)
  }
  return null
}
