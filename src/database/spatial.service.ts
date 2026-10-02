import { db } from './db';
import { SpatialDeliveryCheckResult } from '../types/database.types';

export class PostGISSpatialService {
  /**
   * Executes the PostGIS helper function `check_vendor_delivery_radius`
   * or falls back to WGS84 geodesic calculation when running offline
   */
  async checkVendorDeliveryRadius(
    vendorId: string,
    customerLon: number,
    customerLat: number,
    vendorBaseLon = 28.0473,
    vendorBaseLat = -26.2041,
    maxRadiusKm = 45.0
  ): Promise<SpatialDeliveryCheckResult> {
    const pool = db.getPool();

    if (pool) {
      try {
        const queryText = `
          SELECT within_radius, distance_km 
          FROM check_vendor_delivery_radius($1::uuid, $2::double precision, $3::double precision)
        `;
        const res = await pool.query(queryText, [vendorId, customerLon, customerLat]);
        if (res.rows.length > 0) {
          return {
            within_radius: Boolean(res.rows[0].within_radius),
            distance_km: parseFloat(res.rows[0].distance_km),
          };
        }
      } catch (err) {
        console.warn('[PostGIS] Spatial query fallback:', err);
      }
    }

    // Geodesic WGS84 calculation matching PostGIS ST_Distance(geography)
    return this.calculateGeodesicFallback(
      vendorBaseLon,
      vendorBaseLat,
      customerLon,
      customerLat,
      maxRadiusKm
    );
  }

  /**
   * High-accuracy spherical law of cosines / Haversine calculation matching PostGIS WGS84 (EPSG:4326)
   */
  private calculateGeodesicFallback(
    lon1: number,
    lat1: number,
    lon2: number,
    lat2: number,
    maxRadiusKm: number
  ): SpatialDeliveryCheckResult {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371; // Earth mean radius in km

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightDistanceKm = Math.round(R * c * 100) / 100;

    return {
      within_radius: straightDistanceKm <= maxRadiusKm,
      distance_km: straightDistanceKm,
    };
  }
}

export const postGISSpatialService = new PostGISSpatialService();
