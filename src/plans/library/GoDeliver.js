import { PlanBase, PlanFailure } from "../PlanBase.js"
import { AStarMove } from "./AStarMove.js"
import { samePosition } from "../../utils/distance.js"

/** Compound plan: move to a delivery zone via A*, then put down carried parcels. */
export class GoDeliver extends PlanBase {
  constructor() {
    super("GoDeliver")
    this.movePlan = new AStarMove()
  }

  /**
   * @param {import('../../intentions/Intention.js').Intention} intention
   * @returns {boolean}
   */
  isApplicable(intention) {
    return intention?.predicate?.type === "deliver"
  }

  /**
   * Move to the nearest reachable delivery zone and put down the batch.
   * Re-targets if committed zone is blocked. Clears delivered parcels from beliefs.
   * @param {import('../../intentions/Intention.js').Intention} intention
   * @param {import('../PlanBase.js').PlanContext} context
   * @returns {Promise<void>}
   */
  async execute(intention, context) {
    const { beliefs, actions } = context
    const carried = beliefs.getCarriedParcels()

    if (carried.length === 0) {
      throw new PlanFailure("nothing-to-deliver", false)
    }

    // Re-resolve delivery zone if committed target is blocked or gone.
    const committed = intention.predicate.target
    const needsRetarget =
      !committed ||
      beliefs.isTransientlyBlocked(committed.x, committed.y) ||
      !beliefs.isWalkable(committed.x, committed.y)
    if (needsRetarget) {
      const reachable = beliefs.getNearestDeliveryZone()
      if (!reachable) throw new PlanFailure("no-delivery-zone-available", true)
      intention.predicate.target = reachable
    }

    if (!samePosition(beliefs.me, intention.predicate.target)) {
      await this.movePlan.execute(intention, context)
    }

    const dropped = await actions.putdown(intention.predicate.parcelIds)
    if (dropped === false) throw new PlanFailure("putdown-failed", true)

    // Remove delivered parcels from beliefs; don't wait for next server percept.
    const carriedIds = carried.map(
      (/** @type {import('../../types.js').Parcel} */ parcel) => parcel.id
    )
    const deliveredIds = intention.predicate.parcelIds ?? carriedIds
    for (const parcelId of deliveredIds) {
      if (!parcelId) continue
      const parcel = beliefs.parcels.get(parcelId)
      if (!parcel) continue
      const deliveredParcel = /** @type {import('../../types.js').Parcel} */ ({
        ...parcel,
        carriedBy: null,
        confidence: 0,
        delivered: true,
      })
      beliefs.parcels.set(parcelId, deliveredParcel)
    }
  }
}
