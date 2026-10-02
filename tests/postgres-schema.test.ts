import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { postGISSpatialService } from '../src/database/spatial.service';
import { postgresLedgerService } from '../src/database/postgres-ledger.service';
import { postgresOrderRepository } from '../src/database/postgres-order.repository';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';
import { postgresProductRepository } from '../src/database/postgres-product.repository';

describe('PostgreSQL + PostGIS Schema & Double-Entry Ledger', () => {
  it('should verify migration file contains all tables, enums, indexes, and PostGIS function', () => {
    const migrationFile = path.join(__dirname, '../migrations/001_initial_schema.sql');
    expect(fs.existsSync(migrationFile)).toBe(true);

    const sql = fs.readFileSync(migrationFile, 'utf-8');
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "postgis"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vendors');
    expect(sql).toContain('GEOGRAPHY(Point, 4326)');
    expect(sql).toContain('idx_vendors_location');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS products');
    expect(sql).toContain('order_status AS ENUM');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS orders');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS order_items');
    expect(sql).toContain('ledger_entry_type AS ENUM');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ledger_entries');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION check_vendor_delivery_radius');
  });

  it('should verify check_vendor_delivery_radius spatial logic via PostGISSpatialService', async () => {
    const vendorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const vendorLon = 28.0473;
    const vendorLat = -26.2041;

    // Customer within 45km radius (~8km away in Sandton)
    const customerNearbyLon = 28.0567;
    const customerNearbyLat = -26.1076;

    const nearbyResult = await postGISSpatialService.checkVendorDeliveryRadius(
      vendorId,
      customerNearbyLon,
      customerNearbyLat,
      vendorLon,
      vendorLat,
      45.0
    );

    expect(nearbyResult.within_radius).toBe(true);
    expect(nearbyResult.distance_km).toBeGreaterThan(5);
    expect(nearbyResult.distance_km).toBeLessThan(20);

    // Customer far away (>45km radius, e.g. Pretoria ~60km away)
    const customerFarLon = 28.1881;
    const customerFarLat = -25.7461;

    const farResult = await postGISSpatialService.checkVendorDeliveryRadius(
      vendorId,
      customerFarLon,
      customerFarLat,
      vendorLon,
      vendorLat,
      45.0
    );

    expect(farResult.within_radius).toBe(false);
    expect(farResult.distance_km).toBeGreaterThan(45);
  });

  it('should execute double-entry escrow bookkeeping on ledger_entries with accurate balance_after', async () => {
    const vendorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const orderId = 'e2b3c4d5-6789-4abc-def0-123456789abc';
    const orderRef = 'ORD-2026-9001';

    const settlement = await postgresLedgerService.settleOrderPayment({
      orderId,
      vendorId,
      grossAmount: 3000.0,
      platformFee: 240.0, // 8% of 3000
      gatewayFee: 45.0,   // PayFast fee
      orderRef,
    });

    expect(settlement.paymentReceived.entry_type).toBe('customer_payment_received');
    expect(settlement.paymentReceived.credit_amount).toBe(3000.0);
    expect(settlement.paymentReceived.debit_amount).toBe(0.0);

    expect(settlement.commissionDeducted.entry_type).toBe('platform_commission_earned');
    expect(settlement.commissionDeducted.debit_amount).toBe(240.0);

    expect(settlement.gatewayFeeDeducted.entry_type).toBe('gateway_fee_deducted');
    expect(settlement.gatewayFeeDeducted.debit_amount).toBe(45.0);

    // Net vendor balance after deductions: 3000 - 240 - 45 = 2715.00
    expect(settlement.netVendorEscrowBalance).toBe(2715.0);

    // Verify disbursement entry
    const disbursement = await postgresLedgerService.disburseVendorPayout(
      vendorId,
      2000.0,
      'BATCH-WEEKLY-01'
    );

    expect(disbursement.entry_type).toBe('vendor_payout_disbursed');
    expect(disbursement.debit_amount).toBe(2000.0);
    expect(disbursement.balance_after).toBe(715.0); // 2715 - 2000
  });

  it('should create orders and order_items with PostGIS coordinates and status lifecycle', async () => {
    const order = await postgresOrderRepository.createOrder(
      {
        order_ref: 'ORD-2026-8921',
        vendor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        customer_phone: '+27821112233',
        customer_name: 'Dumisani Nkosi',
        delivery_address: '45 Rivonia Rd, Sandton, Johannesburg',
        delivery_lon: 28.0567,
        delivery_lat: -26.1076,
        distance_km: 14.5,
        subtotal: 2500.0,
        delivery_fee: 569.0,
        total_amount: 3069.0,
        platform_fee: 245.52,
        vendor_payout: 2254.48,
        payment_status: 'unpaid',
        current_status: 'pending_payment',
      },
      [
        {
          product_id: 'p1111111-2222-3333-4444-555555555555',
          quantity: 2,
          unit_price: 1250.0,
          total_price: 2500.0,
        },
      ]
    );

    expect(order.id).toBeDefined();
    expect(order.order_ref).toBe('ORD-2026-8921');
    expect(order.current_status).toBe('pending_payment');

    // Update order status upon payment
    const updatedOrder = await postgresOrderRepository.updateOrderStatus(
      order.id,
      'paid',
      'paid',
      'PF-TX-778899'
    );

    expect(updatedOrder?.current_status).toBe('paid');
    expect(updatedOrder?.payment_status).toBe('paid');
    expect(updatedOrder?.payfast_pf_payment_id).toBe('PF-TX-778899');
  });

  it('should store and query vendors and products in postgres repositories', async () => {
    const vendors = await postgresVendorRepository.findAll();
    expect(vendors.length).toBeGreaterThanOrEqual(2);
    expect(vendors[0].base_location_lon).toBeDefined();
    expect(vendors[0].max_delivery_radius_km).toBe(45.0);

    const savedProd = await postgresProductRepository.saveProduct({
      id: 'prod-uuid-test-01',
      vendor_id: vendors[0].id,
      meta_catalog_id: 'cat_meta_001',
      meta_product_retailer_id: 'SKU-POSTGRES-BRICK',
      title: 'PostGIS Facing Bricks',
      description: 'High grade facing bricks',
      category: 'masonry',
      unit_of_measure: 'per 1000 bricks',
      unit_price: 450.0,
      is_available: true,
    });

    expect(savedProd.id).toBe('prod-uuid-test-01');
    const retrieved = await postgresProductRepository.findByRetailerId('SKU-POSTGRES-BRICK');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe('PostGIS Facing Bricks');
  });
});
