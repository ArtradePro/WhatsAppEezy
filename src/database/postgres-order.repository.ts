import { randomUUID } from 'crypto';
import { db } from './db';
import { DbOrder, DbOrderItem, DbOrderStatus } from '../types/database.types';

export class PostgresOrderRepository {
  private inMemoryOrders: Map<string, DbOrder> = new Map();
  private inMemoryItems: Map<string, DbOrderItem[]> = new Map();

  async createOrder(order: Omit<DbOrder, 'id' | 'created_at'>, items: Array<Omit<DbOrderItem, 'id' | 'order_id'>>): Promise<DbOrder> {
    const orderId = randomUUID();
    const now = new Date().toISOString();

    const pool = db.getPool();
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const insertOrderSql = `
          INSERT INTO orders (
            id, order_ref, vendor_id, customer_phone, customer_name,
            delivery_address, delivery_point, distance_km, subtotal,
            delivery_fee, total_amount, platform_fee, vendor_payout,
            payment_status, payfast_pf_payment_id, current_status, created_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9, $10,
            $11, $12, $13, $14,
            $15, $16, $17, $18
          ) RETURNING *
        `;

        const orderRes = await client.query(insertOrderSql, [
          orderId,
          order.order_ref,
          order.vendor_id,
          order.customer_phone,
          order.customer_name,
          order.delivery_address,
          order.delivery_lon,
          order.delivery_lat,
          order.distance_km,
          order.subtotal,
          order.delivery_fee,
          order.total_amount,
          order.platform_fee,
          order.vendor_payout,
          order.payment_status || 'unpaid',
          order.payfast_pf_payment_id,
          order.current_status || 'draft',
          now,
        ]);

        for (const item of items) {
          const insertItemSql = `
            INSERT INTO order_items (
              id, order_id, product_id, quantity, unit_price, total_price
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `;
          await client.query(insertItemSql, [
            randomUUID(),
            orderId,
            item.product_id,
            item.quantity,
            item.unit_price,
            item.total_price,
          ]);
        }

        await client.query('COMMIT');
        return orderRes.rows[0];
      } catch (err) {
        await client.query('ROLLBACK');
        console.warn('[PostgresOrderRepo] DB insert fallback to memory:', err);
      } finally {
        client.release();
      }
    }

    const createdOrder: DbOrder = {
      ...order,
      id: orderId,
      created_at: now,
    };

    const createdItems: DbOrderItem[] = items.map((i) => ({
      ...i,
      id: randomUUID(),
      order_id: orderId,
    }));

    this.inMemoryOrders.set(orderId, createdOrder);
    this.inMemoryItems.set(orderId, createdItems);

    return createdOrder;
  }

  async updateOrderStatus(
    orderId: string,
    currentStatus: DbOrderStatus,
    paymentStatus?: string,
    pfPaymentId?: string
  ): Promise<DbOrder | null> {
    const pool = db.getPool();
    if (pool) {
      try {
        const updateSql = `
          UPDATE orders 
          SET current_status = $2,
              payment_status = COALESCE($3, payment_status),
              payfast_pf_payment_id = COALESCE($4, payfast_pf_payment_id)
          WHERE id = $1::uuid
          RETURNING *
        `;
        const res = await pool.query(updateSql, [orderId, currentStatus, paymentStatus, pfPaymentId]);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresOrderRepo] Status update fallback:', err);
      }
    }

    const existing = this.inMemoryOrders.get(orderId);
    if (!existing) return null;

    existing.current_status = currentStatus;
    if (paymentStatus) existing.payment_status = paymentStatus;
    if (pfPaymentId) existing.payfast_pf_payment_id = pfPaymentId;

    this.inMemoryOrders.set(orderId, existing);
    return existing;
  }

  async updateDraftOrderDelivery(
    orderId: string,
    updates: {
      delivery_address: string;
      delivery_lon: number;
      delivery_lat: number;
      distance_km: number;
      delivery_fee: number;
      total_amount: number;
      platform_fee: number;
      vendor_payout: number;
      current_status: DbOrderStatus;
    }
  ): Promise<DbOrder | null> {
    const pool = db.getPool();
    if (pool) {
      try {
        const updateSql = `
          UPDATE orders
          SET delivery_address = $2,
              delivery_point = ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
              distance_km = $5,
              delivery_fee = $6,
              total_amount = $7,
              platform_fee = $8,
              vendor_payout = $9,
              current_status = $10
          WHERE id = $1::uuid
          RETURNING *
        `;
        const res = await pool.query(updateSql, [
          orderId,
          updates.delivery_address,
          updates.delivery_lon,
          updates.delivery_lat,
          updates.distance_km,
          updates.delivery_fee,
          updates.total_amount,
          updates.platform_fee,
          updates.vendor_payout,
          updates.current_status,
        ]);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresOrderRepo] updateDraftOrderDelivery fallback:', err);
      }
    }

    const existing = this.inMemoryOrders.get(orderId);
    if (!existing) return null;

    existing.delivery_address = updates.delivery_address;
    existing.delivery_lon = updates.delivery_lon;
    existing.delivery_lat = updates.delivery_lat;
    existing.distance_km = updates.distance_km;
    existing.delivery_fee = updates.delivery_fee;
    existing.total_amount = updates.total_amount;
    existing.platform_fee = updates.platform_fee;
    existing.vendor_payout = updates.vendor_payout;
    existing.current_status = updates.current_status;

    this.inMemoryOrders.set(orderId, existing);
    return existing;
  }

  async findByOrderRef(orderRef: string): Promise<DbOrder | null> {
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM orders WHERE order_ref = $1', [orderRef]);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresOrderRepo] FindByRef fallback:', err);
      }
    }

    for (const ord of this.inMemoryOrders.values()) {
      if (ord.order_ref === orderRef) return ord;
    }
    return null;
  }

  async findById(id: string): Promise<DbOrder | null> {
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM orders WHERE id = $1::uuid', [id]);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresOrderRepo] FindById fallback:', err);
      }
    }
    return this.inMemoryOrders.get(id) || null;
  }

  async findLatestOrder(): Promise<DbOrder | null> {
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 1');
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresOrderRepo] FindLatestOrder fallback:', err);
      }
    }
    const orders = Array.from(this.inMemoryOrders.values());
    return orders.length > 0 ? orders[orders.length - 1] : null;
  }

  async findLatestOrderByStatus(status: DbOrderStatus): Promise<DbOrder | null> {
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query(
          'SELECT * FROM orders WHERE current_status = $1 ORDER BY created_at DESC LIMIT 1',
          [status]
        );
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresOrderRepo] FindLatestOrderByStatus fallback:', err);
      }
    }
    const orders = Array.from(this.inMemoryOrders.values()).reverse();
    return orders.find((o) => o.current_status === status) || null;
  }

  async findAllOrders(vendorId?: string): Promise<DbOrder[]> {
    const pool = db.getPool();
    if (pool) {
      try {
        if (vendorId) {
          const res = await pool.query(
            'SELECT * FROM orders WHERE vendor_id = $1::uuid ORDER BY created_at DESC',
            [vendorId]
          );
          return res.rows;
        }
        const res = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        return res.rows;
      } catch (err) {
        console.warn('[PostgresOrderRepo] FindAllOrders fallback:', err);
      }
    }
    const orders = Array.from(this.inMemoryOrders.values()).reverse();
    return vendorId ? orders.filter((o) => o.vendor_id === vendorId) : orders;
  }
}

export const postgresOrderRepository = new PostgresOrderRepository();
