/**
 * Knex database migration config file
 * 
 * Supports local development Postgres and remote Neon serverless Postgres connections.
 */

require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/freight_brokerage',
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    pool: {
      min: 2,
      max: 10,
    }
  },

  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        // Required for Neon serverless PostgreSQL SSL handshakes
        rejectUnauthorized: false
      }
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    pool: {
      min: 2,
      max: 20, // Neon handles pooling on port 6543, but we keep pool size moderate
      idleTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      acquireTimeoutMillis: 30000,
    }
  }
};
