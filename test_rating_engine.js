/**
 * Rating Engine Test and Seeding Script
 * 
 * This script serves two purposes:
 * 1. Seeds a PostgreSQL database with sample South African coordinates, depots, and rates.
 * 2. Executes the rating engine calculation with mock input:
 *    - Weight: 500kg
 *    - Dimensions: 120x120x100cm
 *    - Route: Cape Town (8001) to Johannesburg (2000)
 * 
 * If no local database is connected, the script runs a self-contained simulation
 * to demonstrate the rating logic and markup calculations.
 */

let Client;
try {
  Client = require('pg').Client;
} catch (e) {
  // pg module not found
}
const { getQuotes, validateRatingRequest } = require('./rating_engine_controller');

// Database configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/freight_brokerage',
  connectionTimeoutMillis: 2000,
};

// Input request matching user prompt
const mockRequest = {
  weight_kg: 500,
  length_cm: 120,
  width_cm: 120,
  height_cm: 100,
  origin_postal_code: '8001',       // Cape Town Centroid
  destination_postal_code: '2000',  // Johannesburg Centroid
};

async function run() {
  console.log('==================================================');
  console.log('     FREIGHT RATING ENGINE TEST SUITE             ');
  console.log('==================================================');
  console.log('Request Payload:');
  console.log(JSON.stringify(mockRequest, null, 2));
  console.log('--------------------------------------------------');

  if (!Client) {
    console.log('⚠ Database driver (pg) is not installed. Running in SIMULATION MODE.');
    runSimulation();
    return;
  }
  const client = new Client(dbConfig);
  let dbConnected = false;

  try {
    console.log(`Connecting to database: ${dbConfig.connectionString}...`);
    await client.connect();
    dbConnected = true;
    console.log('✔ Connected to database successfully.');
  } catch (err) {
    console.log('⚠ Database connection failed. Running in SIMULATION MODE.');
    runSimulation();
    return;
  }

  try {
    // 1. Setup DB Schema and Seed Mock Data
    console.log('Seeding database schemas & mock records...');
    await seedDatabase(client);
    console.log('✔ Database seeded successfully.');

    // 2. Execute Controller Logic (mocking Express req/res objects)
    console.log('Executing rating engine...');
    
    const req = { body: mockRequest };
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      }
    };

    await getQuotes(req, res);

    if (res.statusCode === 200) {
      console.log('\n✔ Quotes generated successfully from database query:\n');
      printQuotesTable(res.body.quotes);
    } else {
      console.error('❌ Controller failed with status code:', res.statusCode);
      console.error(JSON.stringify(res.body, null, 2));
    }

  } catch (error) {
    console.error('❌ Error during database execution:', error);
  } finally {
    await client.end();
  }
}

/**
 * Seeds tables and mock carrier tables for South Africa
 */
async function seedDatabase(client) {
  // Ensure extensions and schema
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "postgis";

    DROP TABLE IF EXISTS quotes CASCADE;
    DROP TABLE IF EXISTS shipments CASCADE;
    DROP TABLE IF EXISTS carrier_rates CASCADE;
    DROP TABLE IF EXISTS za_postal_codes CASCADE;
    DROP TABLE IF EXISTS depots CASCADE;
    DROP TABLE IF EXISTS users CASCADE;

    CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50)
    );

    CREATE TABLE depots (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        carrier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        location GEOMETRY(Point, 4326) NOT NULL
    );

    CREATE TABLE za_postal_codes (
        code VARCHAR(10) PRIMARY KEY,
        place_name VARCHAR(255) NOT NULL,
        centroid GEOMETRY(Point, 4326) NOT NULL
    );

    CREATE TABLE carrier_rates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        carrier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        origin_depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE RESTRICT,
        min_weight_kg DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        max_weight_kg DECIMAL(10, 2) NOT NULL,
        base_rate DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        per_km_rate DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        volumetric_divisor INT NOT NULL DEFAULT 5000,
        fuel_surcharge_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        active BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);

  // 1. Seed South African centroids (WGS84 lat/long)
  // Cape Town Centroid: Longitude 18.4241, Latitude -33.9249
  // Johannesburg Centroid: Longitude 28.0473, Latitude -26.2041
  await client.query(`
    INSERT INTO za_postal_codes (code, place_name, centroid) VALUES
    ('8001', 'Cape Town City Centre', ST_SetSRID(ST_Point(18.4241, -33.9249), 4326)),
    ('2000', 'Johannesburg Central', ST_SetSRID(ST_Point(28.0473, -26.2041), 4326));
  `);

  // 2. Seed 3 Carrier Users
  const userResult = await client.query(`
    INSERT INTO users (email, password_hash, role, company_name, phone) VALUES
    ('info@swiftfreight.co.za', 'hash', 'carrier', 'Swift Freight SA', '+27110000001'),
    ('rates@rhinologistics.co.za', 'hash', 'carrier', 'Rhino Logistics', '+27210000002'),
    ('rates@apexcarrier.co.za', 'hash', 'carrier', 'Apex Cargo Solutions', '+27310000003')
    RETURNING id, company_name;
  `);

  const swiftId = userResult.rows[0].id;
  const rhinoId = userResult.rows[1].id;
  const apexId = userResult.rows[2].id;

  // 3. Seed Carrier Depots near Cape Town (origin)
  // Depot location slightly offset from 8001 centroid
  const depotResult = await client.query(`
    INSERT INTO depots (carrier_id, name, location) VALUES
    ('${swiftId}', 'Swift Cape Town Depot', ST_SetSRID(ST_Point(18.4500, -33.9400), 4326)),
    ('${rhinoId}', 'Rhino Cape Town Depot', ST_SetSRID(ST_Point(18.4800, -33.9100), 4326)),
    ('${apexId}', 'Apex Cape Town Depot', ST_SetSRID(ST_Point(18.4100, -33.9600), 4326))
    RETURNING id, carrier_id;
  `);

  const swiftDepotId = depotResult.rows.find(d => d.carrier_id === swiftId).id;
  const rhinoDepotId = depotResult.rows.find(d => d.carrier_id === rhinoId).id;
  const apexDepotId = depotResult.rows.find(d => d.carrier_id === apexId).id;

  // 4. Seed Carrier Rates matching weight thresholds
  await client.query(`
    INSERT INTO carrier_rates (carrier_id, origin_depot_id, min_weight_kg, max_weight_kg, base_rate, per_km_rate, volumetric_divisor, fuel_surcharge_percentage) VALUES
    ('${swiftId}', '${swiftDepotId}', 100.00, 1000.00, 1200.00, 3.50, 5000, 12.00), -- Swift: 12% surcharge, divisor 5000
    ('${rhinoId}', '${rhinoDepotId}', 100.00, 1000.00, 950.00, 4.10, 4500, 14.50),  -- Rhino: 14.5% surcharge, divisor 4500 (lower divisor = higher weight)
    ('${apexId}', '${apexDepotId}', 100.00, 1000.00, 1500.00, 2.90, 6000, 9.00);    -- Apex: 9% surcharge, divisor 6000 (higher divisor = lower weight)
  `);
}

/**
 * Runs a standalone simulation of the rating math and logic without requiring Postgres/PostGIS.
 */
function runSimulation() {
  console.log('\n--- SIMULATION RUN (No DB Required) ---');
  
  // Geodetic Distance Cape Town centroid (18.4241, -33.9249) to JHB (28.0473, -26.2041)
  // Distance is roughly ~1,260 km (great-circle)
  const distanceKm = 1261.22;
  
  // Mock data that the SQL query would return
  const mockDbRows = [
    {
      carrier_id: 'swift-uuid',
      carrier_name: 'Swift Freight SA',
      depot_name: 'Swift Cape Town Depot',
      depot_to_origin_distance_km: 4.12,
      base_rate: 1200.00,
      per_km_rate: 3.50,
      fuel_surcharge_percentage: 12.00,
      volumetric_divisor: 5000,
      route_distance_km: distanceKm,
    },
    {
      carrier_id: 'rhino-uuid',
      carrier_name: 'Rhino Logistics',
      depot_name: 'Rhino Cape Town Depot',
      depot_to_origin_distance_km: 7.85,
      base_rate: 950.00,
      per_km_rate: 4.10,
      fuel_surcharge_percentage: 14.50,
      volumetric_divisor: 4500,
      route_distance_km: distanceKm,
    },
    {
      carrier_id: 'apex-uuid',
      carrier_name: 'Apex Cargo Solutions',
      depot_name: 'Apex Cape Town Depot',
      depot_to_origin_distance_km: 3.90,
      base_rate: 1500.00,
      per_km_rate: 2.90,
      fuel_surcharge_percentage: 9.00,
      volumetric_divisor: 6000,
      route_distance_km: distanceKm,
    }
  ];

  const MARKUP_PERCENTAGE = 15.0;

  const quotes = mockDbRows.map(row => {
    const actualWeight = mockRequest.weight_kg;
    
    // Volumetric weight: (L * W * H) / Divisor
    const volumeCm3 = mockRequest.length_cm * mockRequest.width_cm * mockRequest.height_cm;
    const volumetricWeight = volumeCm3 / row.volumetric_divisor;
    
    // Chargeable weight: greatest of actual vs volumetric
    const chargeableWeight = Math.max(actualWeight, volumetricWeight);

    const baseCost = row.base_rate;
    const distanceCost = row.route_distance_km * row.per_km_rate;
    const fuelSurchargeCost = (baseCost + distanceCost) * (row.fuel_surcharge_percentage / 100.0);
    const totalCarrierCost = baseCost + distanceCost + fuelSurchargeCost;
    const markupApplied = totalCarrierCost * (MARKUP_PERCENTAGE / 100.0);
    const finalShipperPrice = totalCarrierCost + markupApplied;

    return {
      carrier_id: row.carrier_id,
      carrier_name: row.carrier_name,
      depot_name: row.depot_name,
      route_distance_km: roundToTwo(row.route_distance_km),
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

  // Sort cheapest first
  quotes.sort((a, b) => a.pricing.final_shipper_price - b.pricing.final_shipper_price);

  printQuotesTable(quotes);
}

function printQuotesTable(quotes) {
  const formatted = quotes.map(q => ({
    'Carrier Name': q.carrier_name,
    'Chargeable Wt (kg)': q.chargeable_weight_kg,
    'Distance (km)': q.route_distance_km,
    'Base Cost (ZAR)': q.pricing.base_cost.toFixed(2),
    'Dist Cost (ZAR)': q.pricing.distance_cost.toFixed(2),
    'Fuel Surch. (ZAR)': q.pricing.fuel_surcharge.toFixed(2),
    'Carrier Cost (ZAR)': q.pricing.total_carrier_cost.toFixed(2),
    'Markup (15%)': q.pricing.markup_applied.toFixed(2),
    'Shipper Price (ZAR)': q.pricing.final_shipper_price.toFixed(2),
  }));

  console.table(formatted);
}

function roundToTwo(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

run();
