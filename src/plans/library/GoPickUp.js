import { PlanBase, PlanFailure } from "../PlanBase.js"
import { AStarMove } from "./AStarMove.js"
import { samePosition } from "../../utils/distance.js"

/** Compound plan: move to a parcel tile via A*, then pick it up. */
export class GoPickUp extends PlanBase {
  constructor() {
    super("GoPickUp")
    this.movePlan = new AStarMove()
  }

  /**
   * @param {import('../../intentions/Intention.js').Intention} intention
   * @returns {boolean}
   */
  isApplicable(intention) {
    return intention?.predicate?.type === "pickup"
  }

  /**
   * Navigate to the parcel and pick it up; revise parcel beliefs from the result.
   * @param {import('../../intentions/Intention.js').Intention} intention
   * @param {import('../PlanBase.js').PlanContext} context
   * @returns {Promise<void>}
   */
  async execute(intention, context) {
    const { beliefs, actions } = context
    const { parcelId, target } = intention.predicate
    if (!parcelId) throw new PlanFailure("pickup-missing-parcel-id", false)
    const parcel = beliefs.parcels.get(parcelId)

    if (!parcel || parcel.carriedBy) {
      throw new PlanFailure("parcel-not-available", false)
    }

    if (!samePosition(beliefs.me, target)) {
      await this.movePlan.execute(intention, context)
    }

    const picked = await actions.pickup()
    if (!picked) throw new PlanFailure("pickup-failed", true)
    if (Array.isArray(picked)) {
      beliefs.reviseParcels(picked)
    } else {
      // SDK stubs may return only true — synthesise the update.
      beliefs.reviseParcels([{ ...parcel, carriedBy: beliefs.me?.id }])
    }
  }
}
