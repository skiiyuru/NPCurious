/**
 * This file takes a raw list of possible actions and assigns a "score" 
 * (Expected Value) to each one. It balances how far away a package is, 
 * how far the delivery zone is, and how much the package is worth.
 * * CORE RESPONSIBILITIES:
 * * 1. ROUTE CACHING (bestDeliveryDist)
 * - To save brainpower, it memorizes the distance to delivery zones so 
 * it doesn't have to recalculate the exact same path 100 times.
 * * 2. SCORING PICKUPS
 * - Calculates the true value of a package.
 * - OPPORTUNISTIC BOOST: If a package is literally 1 or 2 steps away, 
 * it artificially boosts the score to say, "Hey, just grab this while 
 * you are walking past it!"
 * * 3. PRIORITIZING DELIVERIES
 * - If the agent is already holding packages, the Analyst slaps a massive 
 * +10,000 bonus score onto the "DELIVER" task to ensure the agent actually 
 * drops things off instead of getting greedy and carrying boxes forever.
 * * 4. RANKING
 * - Sorts the final list of ideas from highest score to lowest score.
 * ============================================================================
 */

import { computeEV, computeOpportunisticEV } from "../utils/ev.js"
import { findPathWithFallback } from "../utils/pathfinding.js"

const OPPORTUNISTIC_PICKUP_STEPS = 2 // 2 step closer big score grab

/**
 * @param {any[]} options           output of generator.generate()
 * @param {import("../beliefs/BeliefBase.js").BeliefBase} beliefBase
 * @param {import("../beliefs/queries.js").BeliefQueries} queries
 * @returns {any[]} 
 */
export function filterOptions(options, beliefBase, queries) {
  const me = beliefBase.me
  if (!me) return []

  // Cache to prevent doing same math
  const deliveryDistCache = new Map()
  function bestDeliveryDist(fromX, fromY) {
    const key = `${Math.round(fromX)},${Math.round(fromY)}`
    if (deliveryDistCache.has(key)) return deliveryDistCache.get(key) // if already calculated from target tiel to dropzone read from the list
    // if not then loop dropzone and find the path keep shortest one
    let best = Infinity
    for (const zone of queries.getDeliveryZones()) {
      const path = findPathWithFallback(fromX, fromY, zone.x, zone.y, queries)
      if (path !== null && path.length < best) best = path.length
    }

    deliveryDistCache.set(key, best)
    return best
  }

  const scored = []
  for (const option of options) { // check options one by one
    if (option.type === "PICKUP") { // if pickup but path block skip intention
      const parcel = option.parcel
      const pickupPath = findPathWithFallback(me.x, me.y, parcel.x, parcel.y, queries)
      if (pickupPath === null) continue

      const pickupSteps = pickupPath.length // step pickup
      const deliverySteps = bestDeliveryDist(parcel.x, parcel.y) //delivery step
      if (!Number.isFinite(deliverySteps)) continue // no idea to deliver skip

      const baseEV = computeEV({ parcel, pickupSteps, deliverySteps }, beliefBase) // calculates the actual point
      const ev = computeOpportunisticEV(baseEV, pickupSteps, OPPORTUNISTIC_PICKUP_STEPS)
      if (ev <= 0) continue // if not worth it skip
      scored.push({ ...option, ev, pickupSteps, deliverySteps }) // push if worth

    } else if (option.type === "DELIVER") { // Delivery always priority than pickup  
      const deliverySteps = bestDeliveryDist(me.x, me.y)
      const carried = queries.getCarriedParcels()
      const totalReward = carried.reduce(
        (sum, p) => sum + beliefBase.estimateReward(p),
        0
      )
      scored.push({
        ...option,
        ev: totalReward + 10000, // Brute force to make delivery first rather than pickup
        deliverySteps,
      })
    } else if (option.type === "EXPLORE") {
      scored.push({ ...option, ev: -1 }) // Explore is last resort
    }
  }
  // Sort descending by EV
  scored.sort((a, b) => b.ev - a.ev)
  return scored
}
