import axios from 'axios';
import { config } from '../../config/env';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
  durationText: string;
  source: 'GOOGLE_DISTANCE_MATRIX' | 'HAVERSINE_ROUTING_FALLBACK';
}

export class DistanceMatrixService {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = config.GOOGLE_MAPS_API_KEY;
  }

  /**
   * Calculates driving transit distance and duration between vendor warehouse and customer pin
   */
  async calculateDistance(origin: Coordinates, destination: Coordinates): Promise<DistanceResult> {
    if (this.apiKey && !config.MOCK_EXTERNAL_APIS) {
      try {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${destination.lat},${destination.lng}&mode=driving&key=${this.apiKey}`;
        const response = await axios.get(url, { timeout: 5000 });

        const element = response.data?.rows?.[0]?.elements?.[0];
        if (element && element.status === 'OK') {
          const meters = element.distance.value;
          const seconds = element.duration.value;
          return {
            distanceKm: Math.round((meters / 1000) * 10) / 10,
            durationMinutes: Math.round(seconds / 60),
            durationText: element.duration.text,
            source: 'GOOGLE_DISTANCE_MATRIX',
          };
        }
      } catch (err) {
        console.warn('Google Distance Matrix API request failed, falling back to Haversine route model:', err);
      }
    }

    // High-accuracy Haversine formula with road detour multiplier (1.32x for urban/suburban roads)
    return this.calculateHaversineRoadDistance(origin, destination);
  }

  /**
   * Haversine formula with urban road curvature adjustment factor
   */
  private calculateHaversineRoadDistance(origin: Coordinates, destination: Coordinates): DistanceResult {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // Earth radius in kilometers

    const dLat = toRad(destination.lat - origin.lat);
    const dLon = toRad(destination.lng - origin.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(origin.lat)) * Math.cos(toRad(destination.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightLineKm = R * c;

    // Road winding/detour factor typically 1.30 to 1.35 in metropolitan areas
    const ROAD_DETOUR_FACTOR = 1.32;
    const estimatedDistanceKm = Math.max(1, Math.round(straightLineKm * ROAD_DETOUR_FACTOR * 10) / 10);

    // Assume average heavy truck transit speed: 45 km/h
    const estimatedMinutes = Math.max(10, Math.round((estimatedDistanceKm / 45) * 60));

    return {
      distanceKm: estimatedDistanceKm,
      durationMinutes: estimatedMinutes,
      durationText: `${estimatedMinutes} mins`,
      source: 'HAVERSINE_ROUTING_FALLBACK',
    };
  }
}

export const distanceMatrixService = new DistanceMatrixService();
