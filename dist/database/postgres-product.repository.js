"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postgresProductRepository = exports.PostgresProductRepository = void 0;
const crypto_1 = require("crypto");
const db_1 = require("./db");
class PostgresProductRepository {
    inMemoryProducts = new Map();
    constructor() {
        this.seedDefaultProducts();
    }
    seedDefaultProducts() {
        const seeded = [
            // Vendor A: BrickDirect Industrial Supplies (retail_delivery)
            {
                id: '11111111-1111-4111-8111-111111111101',
                vendor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                meta_catalog_id: 'cat_brickdirect_001',
                meta_product_retailer_id: 'SKU-SAND-PLASTER-6M3',
                title: 'Plaster Sand (6m³ Bulk Tipper Load)',
                description: 'Washed SABS graded plaster sand delivered via 6m³ tipper.',
                category: 'sand_stone',
                unit_of_measure: 'per 6m3 tipper',
                unit_price: 1850.0,
                is_available: true,
            },
            {
                id: '11111111-1111-4111-8111-111111111102',
                vendor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                meta_catalog_id: 'cat_brickdirect_001',
                meta_product_retailer_id: 'SKU-BRICK-MAXI-1000',
                title: 'Cement Maxi Bricks (1000 Units)',
                description: '7MPa structural cement maxi bricks palletized.',
                category: 'bricks_blocks',
                unit_of_measure: 'per 1000 bricks',
                unit_price: 2450.0,
                is_available: true,
            },
            // Vendor C: Aura Luxe Hair & Wellness Studio (service_booking)
            {
                id: '33333333-3333-4333-8333-333333333301',
                vendor_id: 'c2ddde77-7c2b-4ef8-994d-4bb7bd160c33',
                meta_catalog_id: 'cat_auraluxe_003',
                meta_product_retailer_id: 'SVC-BALAYAGE-CUT',
                title: 'Signature Balayage & Cut (60 min)',
                description: 'Full bespoke balayage colour, toner, blow-wave & precision cut.',
                category: 'hair_styling',
                unit_of_measure: '60 min session',
                unit_price: 650.0,
                is_available: true,
            },
            {
                id: '33333333-3333-4333-8333-333333333302',
                vendor_id: 'c2ddde77-7c2b-4ef8-994d-4bb7bd160c33',
                meta_catalog_id: 'cat_auraluxe_003',
                meta_product_retailer_id: 'SVC-DEEP-TISSUE-60',
                title: 'Deep Tissue Sports Massage (60 min)',
                description: 'Full-body therapeutic myofascial release and hot stone therapy.',
                category: 'wellness_massage',
                unit_of_measure: '60 min session',
                unit_price: 520.0,
                is_available: true,
            },
            {
                id: '33333333-3333-4333-8333-333333333303',
                vendor_id: 'c2ddde77-7c2b-4ef8-994d-4bb7bd160c33',
                meta_catalog_id: 'cat_auraluxe_003',
                meta_product_retailer_id: 'SVC-KERATIN-90',
                title: 'Brazilian Keratin Smoothing (90 min)',
                description: 'Frizz-free keratin treatment with argan infusion.',
                category: 'hair_styling',
                unit_of_measure: '90 min session',
                unit_price: 890.0,
                is_available: true,
            },
            // Vendor D: Napoli Woodfired Pizza & Kitchen (retail_delivery)
            {
                id: '44444444-4444-4444-8444-444444444401',
                vendor_id: 'd3eeef66-6d3c-4fe9-883e-3cc6ce050d44',
                meta_catalog_id: 'cat_napoli_004',
                meta_product_retailer_id: 'FOOD-PIZZA-MARGHERITA',
                title: 'Woodfired Margherita Pizza (XL)',
                description: 'San Marzano tomato, Fior di Latte mozzarella & fresh basil.',
                category: 'woodfired_pizza',
                unit_of_measure: 'per XL pizza',
                unit_price: 145.0,
                is_available: true,
            },
            {
                id: '44444444-4444-4444-8444-444444444402',
                vendor_id: 'd3eeef66-6d3c-4fe9-883e-3cc6ce050d44',
                meta_catalog_id: 'cat_napoli_004',
                meta_product_retailer_id: 'FOOD-PIZZA-DIAVOLA',
                title: 'Diavola Pepperoni & Chilli Honey Pizza',
                description: 'Crispy cured pepperoni, roasted jalapeño & hot honey drizzle.',
                category: 'woodfired_pizza',
                unit_of_measure: 'per XL pizza',
                unit_price: 185.0,
                is_available: true,
            },
        ];
        for (const p of seeded) {
            this.inMemoryProducts.set(p.id, p);
        }
    }
    async saveProduct(product) {
        const id = product.id || (0, crypto_1.randomUUID)();
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const queryText = `
          INSERT INTO products (
            id, vendor_id, meta_catalog_id, meta_product_retailer_id,
            title, description, category, unit_of_measure, unit_price,
            raw_image_url, enhanced_image_url, is_available, draft_specs
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, $9,
            $10, $11, $12, $13
          ) ON CONFLICT (meta_product_retailer_id) DO UPDATE SET
            title = EXCLUDED.title,
            unit_price = EXCLUDED.unit_price,
            enhanced_image_url = EXCLUDED.enhanced_image_url,
            draft_specs = EXCLUDED.draft_specs
          RETURNING *
        `;
                const res = await pool.query(queryText, [
                    id,
                    product.vendor_id,
                    product.meta_catalog_id,
                    product.meta_product_retailer_id ?? null,
                    product.title,
                    product.description,
                    product.category,
                    product.unit_of_measure,
                    product.unit_price,
                    product.raw_image_url,
                    product.enhanced_image_url,
                    product.is_available,
                    product.draft_specs ? JSON.stringify(product.draft_specs) : null,
                ]);
                if (res.rows[0])
                    return res.rows[0];
            }
            catch (err) {
                console.warn('[PostgresProductRepo] DB save fallback:', err);
            }
        }
        const saved = { ...product, id };
        this.inMemoryProducts.set(id, saved);
        return saved;
    }
    async findByRetailerId(retailerId) {
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query('SELECT * FROM products WHERE meta_product_retailer_id = $1', [retailerId]);
                if (res.rows[0])
                    return res.rows[0];
            }
            catch (err) {
                console.warn('[PostgresProductRepo] FindByRetailerId fallback:', err);
            }
        }
        for (const p of this.inMemoryProducts.values()) {
            if (p.meta_product_retailer_id === retailerId)
                return p;
        }
        return null;
    }
    async findByVendor(vendorId) {
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query('SELECT * FROM products WHERE vendor_id = $1::uuid', [vendorId]);
                return res.rows;
            }
            catch (err) {
                console.warn('[PostgresProductRepo] FindByVendor fallback:', err);
            }
        }
        return Array.from(this.inMemoryProducts.values()).filter((p) => p.vendor_id === vendorId);
    }
    async findById(id) {
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query('SELECT * FROM products WHERE id = $1::uuid', [id]);
                if (res.rows[0])
                    return res.rows[0];
            }
            catch (err) {
                console.warn('[PostgresProductRepo] FindById fallback:', err);
            }
        }
        return this.inMemoryProducts.get(id) || null;
    }
    async updateProduct(id, updates) {
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const setClauses = [];
                const values = [id];
                let idx = 2;
                for (const [key, val] of Object.entries(updates)) {
                    setClauses.push(`${key} = $${idx}`);
                    values.push(key === 'draft_specs' && val ? JSON.stringify(val) : val);
                    idx++;
                }
                if (setClauses.length > 0) {
                    const sql = `UPDATE products SET ${setClauses.join(', ')} WHERE id = $1::uuid RETURNING *`;
                    const res = await pool.query(sql, values);
                    if (res.rows[0])
                        return res.rows[0];
                }
            }
            catch (err) {
                console.warn('[PostgresProductRepo] Update fallback:', err);
            }
        }
        const existing = this.inMemoryProducts.get(id);
        if (!existing)
            return null;
        const updated = { ...existing, ...updates };
        this.inMemoryProducts.set(id, updated);
        return updated;
    }
    async deleteProduct(id) {
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                await pool.query('DELETE FROM products WHERE id = $1::uuid', [id]);
            }
            catch (err) {
                console.warn('[PostgresProductRepo] Delete fallback:', err);
            }
        }
        return this.inMemoryProducts.delete(id);
    }
    async findAll() {
        return Array.from(this.inMemoryProducts.values());
    }
}
exports.PostgresProductRepository = PostgresProductRepository;
exports.postgresProductRepository = new PostgresProductRepository();
//# sourceMappingURL=postgres-product.repository.js.map