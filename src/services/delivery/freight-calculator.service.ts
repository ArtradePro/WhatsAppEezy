import { Coordinates, distanceMatrixService } from './distance-matrix.service';
import { CartItem, FreightDeliveryQuote } from '../../types/state.types';
import { config } from '../../config/env';

export interface FreightPricingTier {
  tierName: string;
  minKm: number;
  maxKm: number;
  baseFlagFall: number; // Base vehicle mobilization & loading fee
  ratePerKm: number; // Per-km road transit fee
}

export class FreightCalculatorService {
  // Heavy truck delivery pricing tiers for building materials (ZAR / standard currency)
  private readonly tiers: FreightPricingTier[] = [
    {
      tierName: 'Tier 1: Local Urban (<15km)',
      minKm: 0,
      maxKm: 15,
      baseFlagFall: 350,
      ratePerKm: 25,
    },
    {
      tierName: 'Tier 2: Regional Suburb (15-50km)',
      minKm: 15.001,
      maxKm: 50,
      baseFlagFall: 600,
      ratePerKm: 20,
    },
    {
      tierName: 'Tier 3: Long-Haul Industrial (>50km)',
      minKm: 50.001,
      maxKm: 9999,
      baseFlagFall: 1200,
      ratePerKm: 18,
    },
  ];

  /**
   * Calculates total aggregated volume in cubic meters (m³) from cart items
   * Standards:
   * - Plaster/Building sand bulk tippers: 6m³, 10m³
   * - Bricks: ~2.5m³ displacement per 1000 units (~3.5 tonnes equivalent)
   * - Cement: ~2.0m³ displacement per pallet (40x 50kg bags) or 0.035m³ per individual 50kg bag
   * - Pavers/Aggregates: 1m³ per m³
   */
  calculateAggregatedVolume(items: CartItem[]): number {
    let totalVolume = 0;

    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      const desc = `${item.name} ${item.unitOfMeasure || ''}`.toLowerCase();

      // 1. Explicit 10m³ tipper load
      if (desc.includes('10m³') || desc.includes('10m3') || desc.includes('10 m³') || desc.includes('10 m3')) {
        totalVolume += 10 * qty;
      }
      // 2. Explicit 6m³ tipper load
      else if (desc.includes('6m³') || desc.includes('6m3') || desc.includes('6 m³') || desc.includes('6 m3')) {
        totalVolume += 6 * qty;
      }
      // 3. Regex for arbitrary Xm³ or X m3 in name or unit
      else if (/(?:^|\s)([0-9]+(?:\.[0-9]+)?)\s*(?:m³|m3)/i.test(desc)) {
        const match = desc.match(/(?:^|\s)([0-9]+(?:\.[0-9]+)?)\s*(?:m³|m3)/i);
        const m3 = match ? parseFloat(match[1]) : 1;
        totalVolume += m3 * qty;
      }
      // 4. Per m3 / per m³
      else if (desc.includes('per m3') || desc.includes('per m³') || desc.includes('m³') || desc.includes('m3')) {
        totalVolume += 1 * qty;
      }
      // 5. Bricks: 1000 bricks ~ 2.5m³
      else if (desc.includes('1000 brick') || desc.includes('1000 maxi') || desc.includes('maxi brick')) {
        totalVolume += 2.5 * qty;
      }
      // 6. Pallet of cement (40 bags) ~ 2.0m³
      else if (desc.includes('pallet') || desc.includes('40 bags')) {
        totalVolume += 2.0 * qty;
      }
      // 7. Individual 50kg cement bag ~ 0.035m³
      else if (desc.includes('50kg')) {
        totalVolume += 0.035 * qty;
      }
      // 8. General fallback for other materials
      else {
        totalVolume += 0.5 * qty;
      }
    }

    return Math.round(totalVolume * 100) / 100;
  }

  /**
   * Heavy tipper handling/mobilization surcharge:
   * Standard tippers carry up to 6m³ without surcharge.
   * If total volume > 6m³, apply R250 base surcharge + R75/m³ for every m³ in excess of 6m³.
   */
  calculateTipperSurcharge(totalCubicMeters: number): number {
    if (totalCubicMeters <= 6) {
      return 0;
    }
    const excessVolume = totalCubicMeters - 6;
    return Math.round((250 + excessVolume * 75) * 100) / 100;
  }

  /**
   * Calculates freight delivery quote based on vendor warehouse coordinates and customer location pin.
   * Supports:
   * - Google Distance Matrix road driving distance
   * - Vendor-specific base delivery fee & per-km rate (or tiered fallbacks)
   * - Heavy tipper surcharge for loads exceeding 6m³
   */
  async calculateFreightQuote(
    customerCoords: Coordinates,
    deliveryAddress?: string,
    vendorCoords?: Coordinates,
    items?: CartItem[],
    customRates?: { baseDeliveryFee?: number; perKmRate?: number }
  ): Promise<FreightDeliveryQuote> {
    const origin = vendorCoords || {
      lat: config.VENDOR_DEFAULT_LAT,
      lng: config.VENDOR_DEFAULT_LNG,
    };

    const distanceResult = await distanceMatrixService.calculateDistance(origin, customerCoords);
    const distanceKm = distanceResult.distanceKm;

    // Match appropriate pricing tier
    const activeTier =
      this.tiers.find((t) => distanceKm >= t.minKm && distanceKm <= t.maxKm) ||
      this.tiers[this.tiers.length - 1];

    const baseFlagFall =
      customRates?.baseDeliveryFee !== undefined
        ? Number(customRates.baseDeliveryFee)
        : activeTier.baseFlagFall;

    const ratePerKm =
      customRates?.perKmRate !== undefined
        ? Number(customRates.perKmRate)
        : activeTier.ratePerKm;

    const tierName =
      customRates?.baseDeliveryFee !== undefined && customRates?.perKmRate !== undefined
        ? `Vendor Rate: R${baseFlagFall} + R${ratePerKm}/km`
        : activeTier.tierName;

    const mileageCost = Math.round(distanceKm * ratePerKm * 100) / 100;
    const totalCubicMeters = items && items.length > 0 ? this.calculateAggregatedVolume(items) : 0;
    const tipperSurcharge = this.calculateTipperSurcharge(totalCubicMeters);
    const totalFreightCost = Math.round((baseFlagFall + mileageCost + tipperSurcharge) * 100) / 100;

    return {
      distanceKm,
      durationMinutes: distanceResult.durationMinutes,
      durationText: distanceResult.durationText,
      freightTier: tierName,
      baseFlagFall,
      ratePerKm,
      mileageCost,
      totalCubicMeters,
      tipperSurcharge,
      totalFreightCost,
      customerCoordinates: customerCoords,
      deliveryAddress: deliveryAddress || `GPS Pin (${customerCoords.lat.toFixed(4)}, ${customerCoords.lng.toFixed(4)})`,
      vendorDepotCoordinates: origin,
    };
  }
}

export const freightCalculatorService = new FreightCalculatorService();
