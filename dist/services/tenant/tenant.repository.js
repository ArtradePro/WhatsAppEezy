"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantRepository = exports.TenantRepository = void 0;
class TenantRepository {
    tenants = new Map();
    constructor() {
        this.seedDefaultTenants();
    }
    seedDefaultTenants() {
        // Seed default merchant/supplier: BrickDirect Pro
        const defaultTenant = {
            tenantId: 'tenant_brickdirect',
            businessName: 'BrickDirect Industrial Supplies (Pty) Ltd',
            tradingName: 'BrickDirect Pro',
            taxVatNumber: '4920192837',
            contactEmail: 'billing@brickdirect.co.za',
            contactWhatsApp: '27820000001',
            bankAccount: {
                bankName: 'Standard Bank',
                accountHolderName: 'BrickDirect Industrial Supplies',
                accountNumber: '023456789',
                branchCode: '051001',
                accountType: 'CURRENT',
                isVerified: true,
                verifiedAt: new Date().toISOString(),
            },
            commissionPercentage: 8.0,
            accountingIntegration: 'both',
            xeroContactId: 'xero_contact_bd_01',
            sageCustomerId: 'sage_cust_bd_01',
            depotCoordinates: {
                lat: -26.2041,
                lng: 28.0473,
                address: '14 Heidelberg Road, City Deep, Johannesburg',
            },
            isActive: true,
            createdAt: '2026-01-15T08:00:00.000Z',
        };
        // Seed secondary merchant: Titan Aggregate & Sand
        const titanTenant = {
            tenantId: 'tenant_titan',
            businessName: 'Titan Aggregate & Concrete Quarries',
            tradingName: 'Titan Concrete',
            taxVatNumber: '4839201928',
            contactEmail: 'accounts@titanquarry.co.za',
            contactWhatsApp: '27829990002',
            bankAccount: {
                bankName: 'First National Bank',
                accountHolderName: 'Titan Aggregate Quarries',
                accountNumber: '62849302918',
                branchCode: '250655',
                accountType: 'CHEQUE',
                isVerified: true,
                verifiedAt: new Date().toISOString(),
            },
            commissionPercentage: 7.5,
            accountingIntegration: 'xero',
            xeroContactId: 'xero_contact_titan_02',
            sageCustomerId: 'sage_cust_titan_02',
            depotCoordinates: {
                lat: -26.1150,
                lng: 28.1800,
                address: 'Plot 45, Modderfontein Road, Edenvale',
            },
            isActive: true,
            createdAt: '2026-02-01T09:30:00.000Z',
        };
        this.tenants.set(defaultTenant.tenantId, defaultTenant);
        this.tenants.set(titanTenant.tenantId, titanTenant);
    }
    async findById(tenantId) {
        const tenant = this.tenants.get(tenantId);
        return tenant ? { ...tenant } : null;
    }
    async findAll() {
        return Array.from(this.tenants.values());
    }
    async save(tenant) {
        this.tenants.set(tenant.tenantId, { ...tenant });
        return { ...tenant };
    }
}
exports.TenantRepository = TenantRepository;
exports.tenantRepository = new TenantRepository();
//# sourceMappingURL=tenant.repository.js.map