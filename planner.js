import { Pathfinder } from "./pathfinder.js"

export class AutomatedPlanner {
  /** @param {import("./beliefs.js").BeliefBase} beliefs */
  constructor(beliefs) {
    this.beliefs = beliefs
    this._pf = new Pathfinder(beliefs)
  }

  /**
   * Build a concrete action plan for the current intention.
   *
   * @param {{ type: string, target: any }} intention
   * @returns {{ action: string, dir?: string }[]}
   */
  buildPlan(intention) {
    const me = this.beliefs.me
    if (!me) return []

    // Try with full obstacle avoidance first; if no path found, relax agent avoidance
    // (agents are dynamic so blocking on them can cause deadlocks)
    const planWithFallback = (builder) => {
      const preferredPlan = builder({ avoidAgents: true, avoidCrates: true })
      if (preferredPlan.length > 0) return preferredPlan
      return builder({ avoidAgents: false, avoidCrates: true })
    }

    switch (intention.type) {
      case "PICKUP":
        return planWithFallback((options) =>
          this._planPickup(intention.target, me, options)
        )
      case "DELIVER":
        return planWithFallback((options) => this._planDelivery(me, options))
      case "EXPLORE":
        return planWithFallback((options) =>
          this._planExplore(intention.target, me, options)
        )
      default:
        return []
    }
  }

  // Check the parcel still exists and hasn't been taken, then path to it
  _planPickup(target, me, options) {
    const parcel = this.beliefs.parcels.get(target?.id)
    if (!parcel || parcel.carriedBy) return []

    const dirs = this._pf.findPath(
      Math.round(me.x),
      Math.round(me.y),
      Math.round(parcel.x),
      Math.round(parcel.y),
      options
    )
    if (dirs === null) return []

    return [
      ...dirs.map((dir) => ({ action: "move", dir })),
      { action: "pickup" },
    ]
  }

  // Compare all delivery routes and keep the one with the fewest steps
  _planDelivery(me, options) {
    if (this.beliefs.getCarriedParcels().length === 0) return []

    let bestDirs = null
    let bestLen = Infinity

    for (const tile of this.beliefs.deliveryTiles) {
      const dirs = this._pf.findPath(
        Math.round(me.x),
        Math.round(me.y),
        tile.x,
        tile.y,
        options
      )
      if (dirs !== null && dirs.length < bestLen) {
        bestLen = dirs.length
        bestDirs = dirs
      }
    }

    if (!bestDirs) return []

    return [
      ...bestDirs.map((dir) => ({ action: "move", dir })),
      { action: "putdown" },
    ]
  }

  // Move to the exploration target tile (no pickup at the end)
  _planExplore(target, me, options) {
    if (!target) return []

    const dirs = this._pf.findPath(
      Math.round(me.x),
      Math.round(me.y),
      Math.round(target.x),
      Math.round(target.y),
      options
    )
    if (dirs === null) return []

    return dirs.map((dir) => ({ action: "move", dir }))
  }
}
