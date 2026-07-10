/** @fileoverview Adaptive carry-capacity estimation based on map size, delivery density, and parcel availability. */

import { clamp } from "./math.js"

/**
 * Recommended carry target for this map, clamped to [minCarryCapacity, maxCarryCapacity].
 * @param {import('../types.js').Beliefs} beliefs
 * @param {import('../types.js').Config} config
 * @returns {number}
 */
export function estimateCarryCapacity(beliefs, config) {
  const serverCapacity = beliefs.strategy?.serverCapacity
  if (typeof serverCapacity === "number" && serverCapacity > 0) {
    return serverCapacity
  }

  if (!beliefs.map.width || !beliefs.map.height) {
    return config.minCarryCapacity
  }

  const area = beliefs.map.width * beliefs.map.height
  const deliveryCount = Math.max(1, beliefs.deliveryZones.length)
  const freeParcelCount = beliefs.getFreeParcels().length

  const mapFactor = Math.round(Math.sqrt(area) / 4)
  const sparseDeliveryBonus = deliveryCount <= 2 ? 2 : 0

  let parcelBonus
  if (freeParcelCount >= 8) {
    parcelBonus = 2
  } else if (freeParcelCount >= 4) {
    parcelBonus = 1
  } else {
    parcelBonus = 0
  }

  return clamp(
    config.minCarryCapacity,
    mapFactor + sparseDeliveryBonus + parcelBonus,
    config.maxCarryCapacity
  )
}
