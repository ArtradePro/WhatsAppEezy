"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.xeroTokenStore = exports.XeroTokenStore = void 0;
const db_1 = require("../../database/db");
class XeroTokenStore {
    inMemoryToken = new Map();
    initializedTable = false;
    async ensureTable() {
        if (this.initializedTable)
            return;
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                await pool.query(`
          CREATE TABLE IF NOT EXISTS xero_oauth_tokens (
            id VARCHAR(50) PRIMARY KEY,
            tenant_id VARCHAR(100) NOT NULL,
            token_type VARCHAR(50) NOT NULL DEFAULT 'Bearer',
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            id_token TEXT,
            expires_at BIGINT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
                this.initializedTable = true;
            }
            catch (err) {
                console.warn('[XeroTokenStore] Failed to ensure xero_oauth_tokens table:', err);
            }
        }
    }
    async saveTokens(tenantId, tokenSet) {
        await this.ensureTable();
        const expiresAt = tokenSet.expires_at
            ? tokenSet.expires_at * 1000
            : tokenSet.expires_in
                ? Date.now() + tokenSet.expires_in * 1000
                : Date.now() + 1800 * 1000;
        const stored = {
            tenantId,
            tokenType: tokenSet.token_type || 'Bearer',
            accessToken: tokenSet.access_token || '',
            refreshToken: tokenSet.refresh_token || '',
            idToken: tokenSet.id_token,
            expiresAt,
            updatedAt: new Date().toISOString(),
        };
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const sql = `
          INSERT INTO xero_oauth_tokens (
            id, tenant_id, token_type, access_token, refresh_token, id_token, expires_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (id) DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            token_type = EXCLUDED.token_type,
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            id_token = EXCLUDED.id_token,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW();
        `;
                await pool.query(sql, [
                    'default_tenant',
                    stored.tenantId,
                    stored.tokenType,
                    stored.accessToken,
                    stored.refreshToken,
                    stored.idToken || null,
                    stored.expiresAt,
                ]);
            }
            catch (err) {
                console.warn('[XeroTokenStore] DB save tokens fallback:', err);
            }
        }
        this.inMemoryToken.set('default_tenant', stored);
        this.inMemoryToken.set(tenantId, stored);
    }
    async getTokens(tenantId) {
        await this.ensureTable();
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const queryText = tenantId
                    ? 'SELECT * FROM xero_oauth_tokens WHERE tenant_id = $1 OR id = $1'
                    : "SELECT * FROM xero_oauth_tokens WHERE id = 'default_tenant' OR tenant_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1";
                const res = await pool.query(queryText, tenantId ? [tenantId] : []);
                if (res.rows.length > 0) {
                    const row = res.rows[0];
                    return {
                        tenantId: row.tenant_id,
                        tokenType: row.token_type,
                        accessToken: row.access_token,
                        refreshToken: row.refresh_token,
                        idToken: row.id_token,
                        expiresAt: Number(row.expires_at),
                        updatedAt: row.updated_at,
                    };
                }
            }
            catch (err) {
                console.warn('[XeroTokenStore] DB get tokens fallback:', err);
            }
        }
        if (tenantId && this.inMemoryToken.has(tenantId)) {
            return this.inMemoryToken.get(tenantId);
        }
        return this.inMemoryToken.get('default_tenant') || null;
    }
    async clearTokens() {
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                await pool.query('DELETE FROM xero_oauth_tokens');
            }
            catch (err) {
                console.warn('[XeroTokenStore] DB clear tokens fallback:', err);
            }
        }
        this.inMemoryToken.clear();
    }
}
exports.XeroTokenStore = XeroTokenStore;
exports.xeroTokenStore = new XeroTokenStore();
//# sourceMappingURL=xero-token-store.js.map