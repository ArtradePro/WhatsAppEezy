"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.Database = void 0;
exports.resolveDatabaseProfile = resolveDatabaseProfile;
const pg_1 = require("pg");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
/**
 * Resolves PostgreSQL / Supabase connection settings from environment variables.
 * Automatically enables SSL (`rejectUnauthorized: false`) for Supabase (`*.supabase.co`, `*.pooler.supabase.com`),
 * Railway (`*.railway.app`), or when `sslmode=require` / `DATABASE_SSL=true` is specified.
 */
function resolveDatabaseProfile(databaseUrl = env_1.config.DATABASE_URL, directUrl = env_1.config.DIRECT_URL || '', sslSetting = env_1.config.DATABASE_SSL, mockMode = env_1.config.MOCK_EXTERNAL_APIS, poolMax = env_1.config.DATABASE_POOL_MAX) {
    const normalizedUrl = (databaseUrl || '').trim();
    const normalizedDirect = (directUrl || '').trim() || normalizedUrl;
    const isSupabase = /\.supabase\.(co|com|net)/i.test(normalizedUrl) ||
        /\.supabase\.(co|com|net)/i.test(normalizedDirect) ||
        Boolean(env_1.config.SUPABASE_URL);
    const isSupavisorTransactionPooler = /\.pooler\.supabase\.com/i.test(normalizedUrl) ||
        /:6543(\/|\?|$)/.test(normalizedUrl) ||
        /pgbouncer=true/i.test(normalizedUrl);
    const requiresSslByUrl = isSupabase ||
        /\.railway\.app/i.test(normalizedUrl) ||
        /sslmode=(require|verify-ca|verify-full|prefer)/i.test(normalizedUrl);
    const sslEnabled = sslSetting === 'true' ? true : sslSetting === 'false' ? false : requiresSslByUrl;
    let mode = 'in-memory-mock';
    if (!mockMode && normalizedUrl) {
        if (isSupabase && isSupavisorTransactionPooler) {
            mode = 'supabase-pooler';
        }
        else if (isSupabase) {
            mode = 'supabase-direct';
        }
        else {
            mode = 'postgres';
        }
    }
    return {
        connectionString: normalizedUrl,
        directConnectionString: normalizedDirect,
        isSupabase,
        isSupavisorTransactionPooler,
        sslEnabled,
        maxConnections: poolMax > 0 ? poolMax : 20,
        mode,
    };
}
class Database {
    pool;
    profile;
    constructor() {
        this.profile = resolveDatabaseProfile();
        this.initPool();
    }
    buildPoolConfig(connectionString) {
        const poolConfig = {
            connectionString,
            max: this.profile.maxConnections,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 8000,
            keepAlive: true,
        };
        if (this.profile.sslEnabled) {
            poolConfig.ssl = {
                rejectUnauthorized: false,
            };
        }
        return poolConfig;
    }
    initPool() {
        if (this.profile.connectionString && !env_1.config.MOCK_EXTERNAL_APIS) {
            try {
                this.pool = new pg_1.Pool(this.buildPoolConfig(this.profile.connectionString));
                // Ensure Supabase `extensions` schema (where PostGIS & uuid-ossp live) is always on search_path
                this.pool.on('connect', (client) => {
                    client.query('SET search_path TO public, extensions;').catch(() => {
                        // Ignore if extensions schema does not exist on local Postgres
                    });
                });
                this.pool.on('error', (err) => {
                    console.warn('[PostgreSQL/Supabase Pool] Unexpected error on idle client:', err.message);
                });
            }
            catch (err) {
                console.warn('[PostgreSQL/Supabase Pool] Initialization warning:', err);
            }
        }
    }
    getProfile() {
        return this.profile;
    }
    async query(text, params) {
        if (this.pool) {
            try {
                return await this.pool.query(text, params);
            }
            catch (err) {
                console.error('[PostgreSQL/Supabase Query Error]:', err);
                throw err;
            }
        }
        // Mock empty response if pool not initialized (safe local dev/test mode)
        return {
            rows: [],
            rowCount: 0,
            command: '',
            oid: 0,
            fields: [],
        };
    }
    /**
     * Executes idempotent SQL schema migrations (`migrations/001_initial_schema.sql`).
     * Uses `DIRECT_URL` (port 5432 session connection) when available so DDL statements
     * (`CREATE EXTENSION`, `DO $$ ... $$`, `CREATE OR REPLACE FUNCTION`) succeed even if
     * `DATABASE_URL` points to Supabase's Supavisor transaction pooler (port 6543).
     */
    async runMigrations() {
        const migrationPath = path_1.default.join(__dirname, '../../migrations/001_initial_schema.sql');
        const migration002Path = path_1.default.join(__dirname, '../../migrations/002_multi_tenant_virtual_numbers_and_appointments.sql');
        if (!fs_1.default.existsSync(migrationPath)) {
            return { applied: false, mode: this.profile.mode, migrationFile: migrationPath };
        }
        const sql001 = fs_1.default.readFileSync(migrationPath, 'utf-8');
        const sql002 = fs_1.default.existsSync(migration002Path)
            ? fs_1.default.readFileSync(migration002Path, 'utf-8')
            : '';
        // If a dedicated DIRECT_URL is configured (e.g. Supabase port 5432), use a short-lived migration pool
        const useDedicatedDirectPool = !env_1.config.MOCK_EXTERNAL_APIS &&
            Boolean(env_1.config.DIRECT_URL) &&
            env_1.config.DIRECT_URL !== env_1.config.DATABASE_URL;
        const targetPool = useDedicatedDirectPool
            ? new pg_1.Pool(this.buildPoolConfig(this.profile.directConnectionString))
            : this.pool;
        if (targetPool) {
            try {
                await targetPool.query(sql001);
                if (sql002) {
                    await targetPool.query(sql002);
                }
                console.log(`✅ PostgreSQL + PostGIS Schema Migrations (001 & 002) applied successfully (${this.profile.mode})`);
                return { applied: true, mode: this.profile.mode, migrationFile: migrationPath };
            }
            catch (err) {
                console.warn('⚠️ PostgreSQL Schema Migration notice:', err.message);
                return { applied: false, mode: this.profile.mode, migrationFile: migrationPath };
            }
            finally {
                if (useDedicatedDirectPool) {
                    await targetPool.end().catch(() => { });
                }
            }
        }
        return { applied: false, mode: this.profile.mode, migrationFile: migrationPath };
    }
    /**
     * Performs a health & readiness check for Railway `/health` probes.
     * When `deep = true` and a live pool is active, executes a fast `SELECT 1` round-trip.
     */
    async checkHealth(deep = false) {
        const poolStats = {
            totalCount: this.pool?.totalCount ?? 0,
            idleCount: this.pool?.idleCount ?? 0,
            waitingCount: this.pool?.waitingCount ?? 0,
        };
        if (!this.pool || env_1.config.MOCK_EXTERNAL_APIS) {
            return {
                status: 'mock',
                mode: this.profile.mode,
                connected: true,
                isSupabase: this.profile.isSupabase,
                isSupavisorTransactionPooler: this.profile.isSupavisorTransactionPooler,
                sslEnabled: this.profile.sslEnabled,
                latencyMs: 0,
                postgisAvailable: true,
                poolStats,
            };
        }
        if (!deep) {
            return {
                status: 'healthy',
                mode: this.profile.mode,
                connected: true,
                isSupabase: this.profile.isSupabase,
                isSupavisorTransactionPooler: this.profile.isSupavisorTransactionPooler,
                sslEnabled: this.profile.sslEnabled,
                latencyMs: 0,
                postgisAvailable: true,
                poolStats,
            };
        }
        const start = Date.now();
        try {
            const res = await this.pool.query('SELECT 1 AS ok');
            const latencyMs = Date.now() - start;
            return {
                status: res.rows[0]?.ok === 1 ? 'healthy' : 'degraded',
                mode: this.profile.mode,
                connected: true,
                isSupabase: this.profile.isSupabase,
                isSupavisorTransactionPooler: this.profile.isSupavisorTransactionPooler,
                sslEnabled: this.profile.sslEnabled,
                latencyMs,
                postgisAvailable: true,
                poolStats: {
                    totalCount: this.pool.totalCount,
                    idleCount: this.pool.idleCount,
                    waitingCount: this.pool.waitingCount,
                },
            };
        }
        catch (err) {
            return {
                status: 'degraded',
                mode: this.profile.mode,
                connected: false,
                isSupabase: this.profile.isSupabase,
                isSupavisorTransactionPooler: this.profile.isSupavisorTransactionPooler,
                sslEnabled: this.profile.sslEnabled,
                latencyMs: Date.now() - start,
                postgisAvailable: false,
                poolStats,
            };
        }
    }
    async close() {
        if (this.pool) {
            await this.pool.end();
        }
    }
    getPool() {
        return this.pool;
    }
}
exports.Database = Database;
exports.db = new Database();
//# sourceMappingURL=db.js.map