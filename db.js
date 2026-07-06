/**
 * Centralized Database Connection Pool (PostgreSQL)
 * 
 * Unifies database pooling for both local PostgreSQL and remote Neon Serverless PostgreSQL.
 * Exports a single, shared Pool instance to be imported by all controllers.
 */

const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Configure connection parameters
const connectionConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/freight_brokerage',
  // Max connections in the pool
  max: isProduction ? 20 : 10,
  // Time a client can remain idle in the pool before being closed
  idleTimeoutMillis: 30000,
  // Connection timeout limit (important for Neon cold starts)
  connectionTimeoutMillis: 5000,
};

// If in production, enforce SSL for remote PostgreSQL handshakes (e.g. Neon)
if (isProduction) {
  connectionConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = new Pool(connectionConfig);

// Database Connection Event Listeners for telemetry/logging
pool.on('connect', () => {
  console.log('🐘 PostgreSQL client connected to pool.');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle PostgreSQL client:', err.message);
});

module.exports = pool;
