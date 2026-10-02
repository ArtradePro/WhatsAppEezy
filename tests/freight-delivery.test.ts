import { describe, it, expect } from 'vitest';
import { distanceMatrixService } from '../src/services/delivery/distance-matrix.service';
import { freightCalculatorService } from '../src/services/delivery/freight-calculator.service';

describe('Distance & Delivery Calculator for Bulky Building Materials', () => {
  it('should calculate driving distance and duration from vendor depot to customer coordinates', async () => {
    const origin = { lat: -26.2041, lng: 28.0473 }; // Central Depot
    const destination = { lat: -26.1500, lng: 28.0800 }; // Customer site ~8-10 km away

    const result = await distanceMatrixService.calculateDistance(origin, destination);

    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.durationMinutes).toBeGreaterThan(0);
    expect(result.durationText).toBeDefined();
  });

  it('should apply Tier 1 pricing (<15km) with base flag fall of 350 and 25/km', async () => {
    // 10km away
    const origin = { lat: -26.2041, lng: 28.0473 };
    const destination = { lat: -26.2041 + 0.07, lng: 28.0473 };

    const quote = await freightCalculatorService.calculateFreightQuote(destination, 'Site 10km', origin);

    expect(quote.freightTier).toContain('Tier 1');
    expect(quote.baseFlagFall).toBe(350);
    expect(quote.ratePerKm).toBe(25);
    expect(quote.totalFreightCost).toBe(quote.baseFlagFall + quote.distanceKm * quote.ratePerKm);
  });

  it('should apply Tier 2 pricing (15km-50km) with base flag fall of 600 and 20/km', async () => {
    // ~30km away
    const origin = { lat: -26.2041, lng: 28.0473 };
    const destination = { lat: -26.2041 + 0.22, lng: 28.0473 };

    const quote = await freightCalculatorService.calculateFreightQuote(destination, 'Site 30km', origin);

    expect(quote.freightTier).toContain('Tier 2');
    expect(quote.baseFlagFall).toBe(600);
    expect(quote.ratePerKm).toBe(20);
    expect(quote.totalFreightCost).toBe(quote.baseFlagFall + quote.distanceKm * quote.ratePerKm);
  });

  it('should apply Tier 3 pricing (>50km) with base flag fall of 1200 and 18/km', async () => {
    // ~75km away
    const origin = { lat: -26.2041, lng: 28.0473 };
    const destination = { lat: -26.2041 + 0.60, lng: 28.0473 };

    const quote = await freightCalculatorService.calculateFreightQuote(destination, 'Site 75km', origin);

    expect(quote.freightTier).toContain('Tier 3');
    expect(quote.baseFlagFall).toBe(1200);
    expect(quote.ratePerKm).toBe(18);
    expect(quote.totalFreightCost).toBe(quote.baseFlagFall + quote.distanceKm * quote.ratePerKm);
  });
});
