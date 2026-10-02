import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Server } from 'http';
import { resolveDatabaseProfile } from '../src/database/db';
import { createFastifyApp } from '../src/fastify-app';
import { createApp } from '../src/app';

describe('Railway + Supabase Hybrid Deployment Wiring', () => {
  it('1. Correctly resolves Supabase Supavisor Transaction Pooler (:6543) & Direct Session (:5432) with SSL enabled', () => {
    const supavisorUrl =
      'postgresql://postgres.abcdefghijklm:secretpass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
    const directUrl =
      'postgresql://postgres.abcdefghijklm:secretpass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

    const profile = resolveDatabaseProfile(supavisorUrl, directUrl, 'auto', false, 25);

    expect(profile.isSupabase).toBe(true);
    expect(profile.isSupavisorTransactionPooler).toBe(true);
    expect(profile.sslEnabled).toBe(true);
    expect(profile.mode).toBe('supabase-pooler');
    expect(profile.maxConnections).toBe(25);
    expect(profile.connectionString).toBe(supavisorUrl);
    expect(profile.directConnectionString).toBe(directUrl);
  });

  it('2. Correctly resolves Supabase Direct DB URL (db.<ref>.supabase.co:5432) with automatic SSL', () => {
    const directDbUrl = 'postgresql://postgres:secretpass@db.xyzprojectref.supabase.co:5432/postgres';
    const profile = resolveDatabaseProfile(directDbUrl, '', 'auto', false, 15);

    expect(profile.isSupabase).toBe(true);
    expect(profile.isSupavisorTransactionPooler).toBe(false);
    expect(profile.sslEnabled).toBe(true);
    expect(profile.mode).toBe('supabase-direct');
    expect(profile.directConnectionString).toBe(directDbUrl);
  });

  it('3. Correctly resolves local PostgreSQL URL without forcing SSL unless requested', () => {
    const localUrl = 'postgres://postgres:postgres@localhost:5432/cargodash';
    const profile = resolveDatabaseProfile(localUrl, '', 'auto', false, 10);

    expect(profile.isSupabase).toBe(false);
    expect(profile.isSupavisorTransactionPooler).toBe(false);
    expect(profile.sslEnabled).toBe(false);
    expect(profile.mode).toBe('postgres');
  });

  it('4. Verifies railway.json and migrations/001_initial_schema.sql are configured for Railway + Supabase', () => {
    const railwayJsonPath = path.join(__dirname, '../railway.json');
    const railwayConfig = JSON.parse(fs.readFileSync(railwayJsonPath, 'utf-8'));

    expect(railwayConfig.build.builder).toBe('DOCKERFILE');
    expect(railwayConfig.deploy.healthcheckPath).toBe('/health');
    expect(railwayConfig.deploy.healthcheckTimeout).toBe(100);

    const migrationPath = path.join(__dirname, '../migrations/001_initial_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('SET search_path TO public, extensions;');
    expect(sql).toContain('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS subscription_tier');
    expect(sql).toContain("ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'payment_spread_retained'");
    expect(sql).toContain("ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'gateway_fee_disbursed'");
    expect(sql).toContain("ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'saas_subscription_setoff'");
  });

  it('5. Exposes /health, /api/v1/system/database-profile, and /api/v1/system/migrate on Fastify and Express', async () => {
    const fastifyApp = createFastifyApp();
    await fastifyApp.ready();

    const healthRes = await fastifyApp.inject({
      method: 'GET',
      url: '/health?deep=true',
    });
    expect(healthRes.statusCode).toBe(200);
    const healthBody = healthRes.json();
    expect(healthBody.status).toBe('healthy');
    expect(healthBody.database).toBeDefined();
    expect(healthBody.redis).toBeDefined();

    const profileRes = await fastifyApp.inject({
      method: 'GET',
      url: '/api/v1/system/database-profile',
    });
    expect(profileRes.statusCode).toBe(200);
    expect(profileRes.json().success).toBe(true);

    await fastifyApp.close();

    // Verify Express app parity (used by Dockerfile CMD ["node", "dist/index.js"])
    const expressApp = createApp();
    let server!: Server;
    let baseUrl = '';

    await new Promise<void>((resolve) => {
      server = expressApp.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 3001;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    try {
      const expHealth = await axios.get(`${baseUrl}/health?deep=true`);
      expect(expHealth.status).toBe(200);
      expect(expHealth.data.status).toBe('healthy');
      expect(expHealth.data.database).toBeDefined();
      expect(expHealth.data.redis).toBeDefined();

      const expMigrate = await axios.post(`${baseUrl}/api/v1/system/migrate`);
      expect(expMigrate.status).toBe(200);
      expect(expMigrate.data.success).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
