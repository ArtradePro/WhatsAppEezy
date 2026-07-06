/**
 * Rating Engine Controller
 * 
 * Handles shipment rating requests, queries PostgreSQL/PostGIS for matching carrier rates,
 * calculates volumetric vs actual weights, applies surcharges and markups, and returns
 * sorted quote results.
 */

let pool;
try {
  pool = require('./db');
} catch (e) {
  // db configuration offline
}

/**
 * Express handler for calculating instant shipment quotes.
 * 
 * Expected Request Body:
 * {
 *   "weight_kg": 500,
 *   "length_cm": 120,
 *   "width_cm": 120,
 *   "height_cm": 100,
 *   "origin_postal_code": "8001",       // Cape Town Code
 *   "destination_postal_code": "2000"   // Johannesburg Code
 * }
 */
async function getQuotes(req, res) {
  try {
    let {
      weight_kg,
      length_cm,
      width_cm,
      height_cm,
      origin_postal_code,
      destination_postal_code,
      weight,
      dimensions,
      origin,
      destination,
    } = req.body;

    // Normalization adapter layer for frontend compatibility
    weight_kg = weight_kg !== undefined ? weight_kg : weight;
    origin_postal_code = origin_postal_code !== undefined ? origin_postal_code : origin;
    destination_postal_code = destination_postal_code !== undefined ? destination_postal_code : destination;
    if (dimensions) {
      length_cm = length_cm !== undefined ? length_cm : dimensions.length;
      width_cm = width_cm !== undefined ? width_cm : dimensions.width;
      height_cm = height_cm !== undefined ? height_cm : dimensions.height;
    }

    // 1. Robust Input Validation
    const validationErrors = validateRatingRequest({
      weight_kg,
      length_cm,
      width_cm,
      height_cm,
      origin_postal_code,
      destination_postal_code,
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors,
      });
    }

    // Parse inputs to ensure numeric types
    const parsedWeight = parseFloat(weight_kg);
    const parsedLength = parseFloat(length_cm);
    const parsedWidth = parseFloat(width_cm);
    const parsedHeight = parseFloat(height_cm);

    // 2. Query Database for Matching Carriers and Geolocation Centroids
    // This query:
    //  - Resolves coordinates for postal codes.
    //  - Finds the closest depot for each carrier to the origin (within 150km pickup radius).
    //  - Calculates chargeable weight dynamically based on carrier's specific volumetric divisor.
    //  - Filters rate tables based on the weight brackets.
    //  - Calculates the ellipsoidal distance (in km) between origin and destination using PostGIS.
    const query = `
      WITH route_centroids AS (
          SELECT 
              (SELECT centroid FROM za_postal_codes WHERE code = $1) AS origin_geom,
              (SELECT centroid FROM za_postal_codes WHERE code = $2) AS dest_geom
      ),
      nearest_depots AS (
          SELECT 
              d.id AS depot_id,
              d.carrier_id,
              d.name AS depot_name,
              d.location AS depot_location,
              ST_Distance(d.location::geography, rc.origin_geom::geography) / 1000.0 AS depot_to_origin_distance_km,
              ROW_NUMBER() OVER (
                  PARTITION BY d.carrier_id 
                  ORDER BY ST_Distance(d.location::geography, rc.origin_geom::geography)
              ) as rn
          FROM depots d
          CROSS JOIN route_centroids rc
          -- Ensure origin geom exists and depot is within 150km pickup zone
          WHERE rc.origin_geom IS NOT NULL 
            AND ST_DWithin(d.location::geography, rc.origin_geom::geography, 150000)
      ),
      rates_with_chargeable_weight AS (
          SELECT 
              nd.carrier_id,
              nd.depot_id,
              nd.depot_name,
              nd.depot_to_origin_distance_km,
              cr.id AS rate_id,
              cr.base_rate,
              cr.per_km_rate,
              cr.fuel_surcharge_percentage,
              cr.volumetric_divisor,
              cr.min_weight_kg,
              cr.max_weight_kg,
              -- Volumetric weight = (L * W * H) / Divisor
              -- Chargeable weight is the GREATEST of actual weight and volumetric weight
              GREATEST($3::decimal, ($4::decimal * $5::decimal * $6::decimal) / NULLIF(cr.volumetric_divisor, 0.0)) AS chargeable_weight_kg,
              -- Direct ellipsoidal distance from origin to destination in kilometers
              (ST_Distance(rc.origin_geom::geography, rc.dest_geom::geography) / 1000.0) AS route_distance_km
          FROM nearest_depots nd
          CROSS JOIN route_centroids rc
          JOIN carrier_rates cr ON cr.origin_depot_id = nd.depot_id
          WHERE nd.rn = 1 
            AND cr.active = TRUE
      )
      SELECT 
          rcw.*,
          u.company_name AS carrier_name
      FROM rates_with_chargeable_weight rcw
      JOIN users u ON rcw.carrier_id = u.id
      WHERE rcw.chargeable_weight_kg >= rcw.min_weight_kg 
        AND rcw.chargeable_weight_kg <= rcw.max_weight_kg;
    `;

    const values = [
      origin_postal_code.trim(),
      destination_postal_code.trim(),
      parsedWeight,
      parsedLength,
      parsedWidth,
      parsedHeight,
    ];

    const result = await pool.query(query, values);

    // 3. Process and Calculate Quotes
    const MARKUP_PERCENTAGE = 15.0; // Platform 15% markup
    const quotes = result.rows.map(row => {
      const baseCost = parseFloat(row.base_rate);
      const distanceKm = parseFloat(row.route_distance_km);
      const perKmRate = parseFloat(row.per_km_rate);
      const fuelSurchargePct = parseFloat(row.fuel_surcharge_percentage);
      const chargeableWeight = parseFloat(row.chargeable_weight_kg);

      // Distance cost calculation
      const distanceCost = distanceKm * perKmRate;

      // Fuel surcharge calculation: applied to base_cost + distance_cost
      const fuelSurchargeCost = (baseCost + distanceCost) * (fuelSurchargePct / 100.0);

      // Total cost charged by the carrier
      const totalCarrierCost = baseCost + distanceCost + fuelSurchargeCost;

      // Platform markup calculation
      const markupApplied = totalCarrierCost * (MARKUP_PERCENTAGE / 100.0);

      // Final price shown to the Shipper
      const finalShipperPrice = totalCarrierCost + markupApplied;

      return {
        carrier_id: row.carrier_id,
        carrier_name: row.carrier_name,
        depot_name: row.depot_name,
        route_distance_km: roundToTwo(distanceKm),
        chargeable_weight_kg: roundToTwo(chargeableWeight),
        depot_to_origin_distance_km: roundToTwo(row.depot_to_origin_distance_km),
        pricing: {
          base_cost: roundToTwo(baseCost),
          distance_cost: roundToTwo(distanceCost),
          fuel_surcharge: roundToTwo(fuelSurchargeCost),
          total_carrier_cost: roundToTwo(totalCarrierCost),
          markup_percentage: MARKUP_PERCENTAGE,
          markup_applied: roundToTwo(markupApplied),
          final_shipper_price: roundToTwo(finalShipperPrice),
        },
      };
    });

    // 4. Sort quotes by final shipper price ascending (cheapest first)
    quotes.sort((a, b) => a.pricing.final_shipper_price - b.pricing.final_shipper_price);

    // Return the response
    return res.status(200).json({
      success: true,
      shipment: {
        weight_kg: parsedWeight,
        dimensions: `${parsedLength}x${parsedWidth}x${parsedHeight}cm`,
        origin: origin_postal_code,
        destination: destination_postal_code,
      },
      quotes_count: quotes.length,
      quotes: quotes,
    });

  } catch (error) {
    console.error('Error in Rating Engine Controller:', error);
    
    // Check for specific PostgreSQL/PostGIS issues (e.g. missing centroids or geometry errors)
    if (error.code === '22012') { // Division by zero error
      return res.status(500).json({
        success: false,
        error: 'Internal configuration error: Carrier volumetric divisor is zero.',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to calculate quotes due to an internal server error.',
    });
  }
}

/**
 * Validates the parameters for a rating request.
 * @param {Object} data 
 * @returns {Array<string>} list of validation errors
 */
function validateRatingRequest(data) {
  const errors = [];
  const {
    weight_kg,
    length_cm,
    width_cm,
    height_cm,
    origin_postal_code,
    destination_postal_code,
  } = data;

  // Weight validation
  if (weight_kg === undefined || weight_kg === null) {
    errors.push('weight_kg is required');
  } else {
    const w = parseFloat(weight_kg);
    if (isNaN(w) || w <= 0) {
      errors.push('weight_kg must be a positive number');
    }
  }

  // Dimensions validations
  const dimensions = { length_cm, width_cm, height_cm };
  for (const [key, val] of Object.entries(dimensions)) {
    if (val === undefined || val === null) {
      errors.push(`${key} is required`);
    } else {
      const v = parseFloat(val);
      if (isNaN(v) || v <= 0) {
        errors.push(`${key} must be a positive number`);
      }
    }
  }

  // Postal codes validations
  if (!origin_postal_code || typeof origin_postal_code !== 'string' || origin_postal_code.trim() === '') {
    errors.push('origin_postal_code is required and must be a valid string');
  } else if (!/^\d{4}$/.test(origin_postal_code.trim())) {
    errors.push('origin_postal_code must be a 4-digit South African postal code');
  }

  if (!destination_postal_code || typeof destination_postal_code !== 'string' || destination_postal_code.trim() === '') {
    errors.push('destination_postal_code is required and must be a valid string');
  } else if (!/^\d{4}$/.test(destination_postal_code.trim())) {
    errors.push('destination_postal_code must be a 4-digit South African postal code');
  }

  return errors;
}

/**
 * Utility helper to round numbers to 2 decimal places.
 * @param {number} val 
 * @returns {number}
 */
function roundToTwo(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

module.exports = {
  getQuotes,
  validateRatingRequest,
};
