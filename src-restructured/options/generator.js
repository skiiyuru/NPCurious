/**
 * This file translates what the agent knows (Beliefs) into a list of 
 * possible things it could do (Options). It is heavily optimized: instead 
 * of constantly thinking every single second, it just sits back and listens 
 * to the Loudspeaker (BeliefEvents). It only brainstorms new ideas when 
 * something actually changes in the world.
 * * CORE RESPONSIBILITIES:
 * * 1. LISTING DELIVERIES:
 * If the agent is holding packages, it writes down an idea to walk to 
 * every single known drop-off zone.
 * * 2. LISTING PICKUPS:
 * It asks the Librarian for all free packages on the ground (ignoring 
 * ones on the "Do-Not-Disturb" blacklist) and writes down an idea to 
 * go pick up each one.
 * * 3. FALLBACK (Explore):
 * If the map is completely empty and there are no packages anywhere, 
 * it writes down one single idea: "Wander around and explore."
 * ============================================================================
 */

/**
 * @param {import("../beliefs/BeliefBase.js").BeliefBase} beliefBase
 * @param {import("../beliefs/queries.js").BeliefQueries} queries
 * @param {(options: any[]) => void} onOptionsReady  callback invoked with new option list
 */
export function createOptionGenerator(beliefBase, queries, onOptionsReady) {

  function generate() {
    const options = []
    const now = Date.now()

    const carried = queries.getCarriedParcels()

    // Delivering options
    if (carried.length > 0) { // agent holding something
      for (const zone of queries.getDeliveryZones()) { // list of dropzone on map
        options.push({ // push intention to deliver of each dropzone
          type: "DELIVER",
          target: zone,
          generatedAt: now,
        })
      }
    }

    // Pickup options
    const freeParcels = queries.getFreeParcels().filter(
      (p) => !queries.isTargetBlacklisted(`parcel:${p.id}`)
    )
    for (const parcel of freeParcels) { // same agnet ask about the pickupzone and listed which are blacklisted and push intention
      options.push({
        type: "PICKUP",
        parcel,
        generatedAt: now,
      })
    }

    // Exploring 
    if (options.length === 0) { // If above actions are done then try to explore
      options.push({ type: "EXPLORE", generatedAt: now })
    }

    onOptionsReady(options)
  }

//  If the agents get info from events about stolen package, agent drop pacakage, etc will generate new idea
  beliefBase.events.on("parcel-appeared", generate)
  beliefBase.events.on("parcel-taken", generate)
  beliefBase.events.on("parcel-gone", generate)
  beliefBase.events.on("carry-changed", generate)

  return { generate }
}
