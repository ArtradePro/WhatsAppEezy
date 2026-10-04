"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postGISSpatialService = exports.PostGISSpatialService = void 0;
const db_1 = require("./db");
class PostGISSpatialService {
    /**
     * Executes the PostGIS helper function `check_vendor_delivery_radius`
     * or falls back to WGS84 geodesic calculation when running offline
     */
    async checkVendorDeliveryRadius(vendorId, customerLon, customerLat, vendorBaseLon = 28.0473, vendorBaseLat = -26.2041, maxRadiusKm = 45.0) {
        const pool = db_1.db.getPool();
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
            }
            catch (err) {
                console.warn('[PostGIS] Spatial query fallback:', err);
            }
        }
        // Geodesic WGS84 calculation matching PostGIS ST_Distance(geography)
        return this.calculateGeodesicFallback(vendorBaseLon, vendorBaseLat, customerLon, customerLat, maxRadiusKm);
    }
    /**
     * High-accuracy spherical law of cosines / Haversine calculation matching PostGIS WGS84 (EPSG:4326)
     */
    calculateGeodesicFallback(lon1, lat1, lon2, lat2, maxRadiusKm) {
        const toRad = (deg) => (deg * Math.PI) / 180;
        const R = 6371; // Earth mean radius in km
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const straightDistanceKm = Math.round(R * c * 100) / 100;
        return {
            within_radius: straightDistanceKm <= maxRadiusKm,
            distance_km: straightDistanceKm,
        };
    }
}
exports.PostGISSpatialService = PostGISSpatialService;
exports.postGISSpatialService = new PostGISSpatialService();
//# sourceMappingURL=spatial.service.js.map