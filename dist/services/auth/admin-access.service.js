"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAccessService = exports.AdminAccessService = exports.AdminAccessError = void 0;
exports.protectedAdminPath = protectedAdminPath;
const env_1 = require("../../config/env");
const db_1 = require("../../database/db");
class AdminAccessError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.AdminAccessError = AdminAccessError;
class AdminAccessService {
    async authenticate(authorization) {
        if (!authorization?.startsWith('Bearer '))
            throw new AdminAccessError(401, 'Sign-in required');
        if (!env_1.config.SUPABASE_URL || !env_1.config.SUPABASE_ANON_KEY)
            throw new AdminAccessError(503, 'Account service is not configured');
        const base = new URL(env_1.config.SUPABASE_URL);
        if (base.protocol !== 'https:')
            throw new AdminAccessError(503, 'Account service requires HTTPS');
        let user;
        try {
            const response = await fetch(new URL('/auth/v1/user', base.origin), {
                headers: { apikey: env_1.config.SUPABASE_ANON_KEY, Authorization: authorization }, signal: AbortSignal.timeout(8000), redirect: 'error',
            });
            if (response.status === 401 || response.status === 403)
                throw new AdminAccessError(401, 'Session is invalid or expired');
            if (!response.ok)
                throw new AdminAccessError(503, 'Account service is unavailable');
            user = await response.json();
        }
        catch (error) {
            if (error instanceof AdminAccessError)
                throw error;
            throw new AdminAccessError(503, 'Account service is unavailable');
        }
        if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id))
            throw new AdminAccessError(401, 'Invalid account identity');
        const pool = db_1.db.getPool();
        if (!pool)
            throw new AdminAccessError(503, 'Company access database is unavailable');
        try {
            const [admins, memberships] = await Promise.all([
                pool.query('SELECT user_id FROM platform_administrators WHERE user_id = $1::uuid', [user.id]),
                pool.query('SELECT vendor_id, role FROM merchant_memberships WHERE user_id = $1::uuid', [user.id]),
            ]);
            return { userId: user.id, isPlatformAdmin: admins.rows.length > 0, memberships: memberships.rows };
        }
        catch {
            throw new AdminAccessError(503, 'Company access database is unavailable');
        }
    }
    async authorize(principal, method, pathname, query, body) {
        if (principal.isPlatformAdmin)
            return;
        const verb = method.toUpperCase();
        let vendorId;
        let allowedRoles = ['owner', 'manager', 'staff', 'viewer'];
        const vendor = pathname.match(/^\/api\/v1\/vendors\/([^/]+)$/);
        const resource = pathname.match(/^\/api\/(?:v1\/catalog\/products|v1\/products|(?:vendor\/)?orders)\/([^/]+)(?:\/(?:status|eta))?$/);
        if (vendor && ['PATCH', 'PUT'].includes(verb)) {
            vendorId = vendor[1];
            allowedRoles = ['owner'];
            const fields = ['business_name', 'contact_email', 'depot_address', 'base_location_lat', 'base_location_lon', 'max_delivery_radius_km', 'base_delivery_fee', 'per_km_rate', 'free_delivery_radius_km'];
            if (Object.keys(body).some(key => !fields.includes(key)))
                throw new AdminAccessError(403, 'These company fields require platform administration');
        }
        else if (verb === 'GET' && ['/api/vendor/orders', '/api/v1/catalog/products', '/api/v1/appointments'].includes(pathname)) {
            vendorId = typeof query.vendor_id === 'string' ? query.vendor_id : undefined;
        }
        else if (verb === 'POST' && pathname === '/api/v1/catalog/products') {
            vendorId = typeof body.vendor_id === 'string' ? body.vendor_id : undefined;
            allowedRoles = ['owner', 'manager'];
        }
        else if (resource && ['PATCH', 'PUT', 'DELETE', 'POST'].includes(verb)) {
            const product = pathname.includes('products/');
            allowedRoles = product ? ['owner', 'manager'] : ['owner', 'manager', 'staff'];
            if (!product && pathname.endsWith('/status') && !['dispatched', 'delivered'].includes(String(body.status)))
                throw new AdminAccessError(403, 'Payment and cancellation transitions require platform administration');
            const pool = db_1.db.getPool();
            if (!pool)
                throw new AdminAccessError(503, 'Company access database is unavailable');
            const sql = product ? 'SELECT vendor_id FROM products WHERE id::text = $1' : 'SELECT vendor_id FROM orders WHERE id::text = $1 OR order_ref = $1';
            try {
                vendorId = (await pool.query(sql, [decodeURIComponent(resource[1])])).rows[0]?.vendor_id;
            }
            catch {
                throw new AdminAccessError(503, 'Resource permissions could not be verified');
            }
        }
        else {
            throw new AdminAccessError(403, 'Platform administration is required for this action');
        }
        if (!vendorId || !principal.memberships.some(membership => membership.vendor_id === vendorId && allowedRoles.includes(membership.role)))
            throw new AdminAccessError(403, 'You do not have permission for this company or action');
    }
}
exports.AdminAccessService = AdminAccessService;
exports.adminAccessService = new AdminAccessService();
function protectedAdminPath(url) {
    const pathname = url.split('?')[0];
    if (pathname === '/api/v1/payments/payfast/itn')
        return false;
    return pathname.startsWith('/api/') && !/^\/api\/webhooks\/(?:whatsapp|payfast\/itn|gupshup)$/.test(pathname);
}
//# sourceMappingURL=admin-access.service.js.map