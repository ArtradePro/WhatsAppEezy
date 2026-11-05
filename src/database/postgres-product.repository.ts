import { randomUUID } from 'crypto';
import { db } from './db';
import { DbProduct } from '../types/database.types';

export class PostgresProductRepository {
  private inMemoryProducts: Map<string, DbProduct> = new Map();

  constructor() {
    this.seedDefaultProducts();
  }

  private seedDefaultProducts() {
    const seeded: DbProduct[] = [
      // Vendor A: BrickDirect Industrial Supplies (retail_delivery)
      {
        id: '11111111-1111-4111-8111-111111111101',
        vendor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        meta_catalog_id: 'cat_brickdirect_001',
        meta_product_retailer_id: 'SKU-SAND-PLASTER-6M3',
        title: 'Plaster Sand (Washed Malmesbury Grade)',
        description: 'Fine screened SABS plaster sand for exterior rendering and masonry brickwork.',
        category: 'sand_stone',
        unit_of_measure: 'per m3',
        unit_price: 550.0,
        is_available: true,
      },
      {
        id: '11111111-1111-4111-8111-111111111103',
        vendor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        meta_catalog_id: 'cat_brickdirect_001',
        meta_product_retailer_id: 'MAT-SAND-BUILD-02',
        title: 'Coarse River Building Sand',
        description: 'High tensile river sand suitable for structural concrete footing and slab foundations.',
        category: 'sand_stone',
        unit_of_measure: 'per m3',
        unit_price: 480.0,
        is_available: true,
      },
      {
        id: '11111111-1111-4111-8111-111111111104',
        vendor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        meta_catalog_id: 'cat_brickdirect_001',
        meta_product_retailer_id: 'MAT-STONE-19MM-03',
        title: '19mm Blue Crushed Stone Aggregate',
        description: 'Crushed granite stone for 25-30 MPa civil reinforced concrete and driveways.',
        category: 'sand_stone',
        unit_of_measure: 'per m3',
        unit_price: 620.0,
        is_available: true,
      },
      {
        id: '11111111-1111-4111-8111-111111111102',
        vendor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        meta_catalog_id: 'cat_brickdirect_001',
        meta_product_retailer_id: 'SKU-BRICK-MAXI-1000',
        title: 'Cement Maxi Bricks (7 MPa)',
        description: '7MPa structural cement maxi bricks palletized (R2,600 per 1000pcs).',
        category: 'bricks_blocks',
        unit_of_measure: 'per 1000pcs',
        unit_price: 2600.0,
        vat_inclusive: false,
        is_available: true,
      },
      // Vendor E & F: Higiene (+1 555-344-3356) & Fungus No More (+1 555-462-9242) Shared Catalog (cat_higiene_005)
      {
        id: '55555555-5555-4555-8555-555555555501',
        vendor_id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        meta_catalog_id: 'cat_higiene_005',
        meta_product_retailer_id: 'FNM-SB-500',
        title: 'Sea Breeze Shower Gel (500 ml)',
        description: 'Invigorating daily cooling body wash formulated with active Australian tea tree and eucalyptus. Crisp oceanic fragrance for active lifestyles.',
        category: 'body_wash',
        unit_of_measure: '500 ml bottle',
        unit_price: 149.0,
        enhanced_image_url: 'https://fungusnomore.co.za/wp-content/uploads/2026/02/FNM-Sea-Breeze.png',
        is_available: true,
      },
      {
        id: '55555555-5555-4555-8555-555555555502',
        vendor_id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        meta_catalog_id: 'cat_higiene_005',
        meta_product_retailer_id: 'FNM-POM-500',
        title: 'Pomegranate Shower Gel (500 ml)',
        description: 'Fruity antioxidant-rich body wash crafted with pure pomegranate extract. Supports skin barrier defense and soothes sensitive skin.',
        category: 'body_wash',
        unit_of_measure: '500 ml bottle',
        unit_price: 149.0,
        enhanced_image_url: 'https://fungusnomore.co.za/wp-content/uploads/2026/02/FNM-Pomegranate.png',
        is_available: true,
      },
      {
        id: '55555555-5555-4555-8555-555555555503',
        vendor_id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        meta_catalog_id: 'cat_higiene_005',
        meta_product_retailer_id: 'FNM-COC-050',
        title: 'Coconut Antifungal Spray (50 ml)',
        description: 'Targeted precision spray for instant topical defense against friction, moisture, and fungal discomfort. Pure fractionated coconut oil.',
        category: 'topical_spray',
        unit_of_measure: '50 ml bottle',
        unit_price: 189.0,
        enhanced_image_url: 'https://fungusnomore.co.za/wp-content/uploads/2026/10/sku_coc_050ml_58124216-6807-4d48-a481-66d629cee5bb.png',
        is_available: true,
      },
      {
        id: '55555555-5555-4555-8555-555555555504',
        vendor_id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        meta_catalog_id: 'cat_higiene_005',
        meta_product_retailer_id: 'FNM-SB-2X500',
        title: 'Sea Breeze 2 x 500 ml Value Pack',
        description: 'Two full bottles of Sea Breeze shower gel for unbroken skin defense. Double supply ensures zero interruption. Direct manufacturer value pricing. Keep one at home and one in gym locker.',
        category: 'value_bundles',
        unit_of_measure: 'twin pack (1000 ml)',
        unit_price: 285.0,
        enhanced_image_url: 'https://whatsappeezy.up.railway.app/assets/products/sea-breeze-2-pack.jpg',
        is_available: true,
      },
      {
        id: '55555555-5555-4555-8555-555555555505',
        vendor_id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        meta_catalog_id: 'cat_higiene_005',
        meta_product_retailer_id: 'FNM-POM-2X500',
        title: 'Pomegranate 2 x 500 ml Value Pack',
        description: 'Two full bottles of Pomegranate shower gel for lasting daily protection. Generous 1-litre volume. Fruity uplifting cleanse supporting skin clarity & barrier health. Ideal for families.',
        category: 'value_bundles',
        unit_of_measure: 'twin pack (1000 ml)',
        unit_price: 285.0,
        enhanced_image_url: 'https://fungusnomore.co.za/wp-content/uploads/2026/02/FNM-Pomegranate-2-Pack.png',
        is_available: true,
      },
      {
        id: '55555555-5555-4555-8555-555555555506',
        vendor_id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        meta_catalog_id: 'cat_higiene_005',
        meta_product_retailer_id: 'FNM-MIX-2X500',
        title: 'Duo Balance Pack (Sea Breeze + Pomegranate)',
        description: 'Experience both marine coolness and fruity comfort in one pack. Dual ritual: Morning Sea Breeze energy + Evening Pomegranate relaxation. Direct manufacturer savings.',
        category: 'value_bundles',
        unit_of_measure: 'twin pack (1000 ml)',
        unit_price: 285.0,
        enhanced_image_url: 'https://whatsappeezy.up.railway.app/assets/products/duo-balance-pack.jpg',
        is_available: true,
      },
      {
        id: '55555555-5555-4555-8555-555555555507',
        vendor_id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        meta_catalog_id: 'cat_higiene_005',
        meta_product_retailer_id: 'FNM-BNDL-ALL',
        title: 'Complete Regimen Bundle (3-Piece)',
        description: 'Premier 3-step skin defense protocol: 1x Sea Breeze (500 ml) + 1x Pomegranate (500 ml) + 1x Coconut Spray (50 ml). Unlocks FREE Courier Delivery!',
        category: 'value_bundles',
        unit_of_measure: '3-piece kit',
        unit_price: 449.0,
        enhanced_image_url: 'https://fungusnomore.co.za/wp-content/uploads/2026/02/FNM-Bundle-3-Pack.png',
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
      // Vendor G: LCSH Smartspace — la Cock Signature Homes (Pty) Ltd (construction_quotes)
      {
        id: '99999999-9999-4999-8999-999999999901',
        vendor_id: '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77',
        meta_catalog_id: 'cat_lcsh_007',
        meta_product_retailer_id: 'LCSH-MOD-UNITA',
        title: 'SmartSpace Unit A (Cozy Retreat - 21.6m²)',
        description: 'Luxury turnkey studio modular living pod (3m x 7.2m) with kitchenette, en-suite bathroom, stoep & braai pit.',
        category: 'modular_homes',
        unit_of_measure: 'turnkey pod',
        unit_price: 185000.0,
        is_available: true,
      },
      {
        id: '99999999-9999-4999-8999-999999999902',
        vendor_id: '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77',
        meta_catalog_id: 'cat_lcsh_007',
        meta_product_retailer_id: 'LCSH-MOD-UNITB',
        title: 'SmartSpace Unit B (Practical Living 1-Bed - 21.6m²)',
        description: 'Turnkey 1-bedroom modular pod (3m x 7.2m) with private bedroom, acoustic partition wall, designer bathroom & gas geyser.',
        category: 'modular_homes',
        unit_of_measure: 'turnkey pod',
        unit_price: 215000.0,
        is_available: true,
      },
      {
        id: '99999999-9999-4999-8999-999999999903',
        vendor_id: '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77',
        meta_catalog_id: 'cat_lcsh_007',
        meta_product_retailer_id: 'LCSH-MOD-UNITCD',
        title: 'SmartSpace Unit C & D (Expanded Multi-Pod / Office)',
        description: 'Expanded executive modular workspace or multi-pod living with floor-to-ceiling glass and flexible layout.',
        category: 'modular_homes',
        unit_of_measure: 'custom unit',
        unit_price: 265000.0,
        is_available: true,
      },
      {
        id: '99999999-9999-4999-8999-999999999904',
        vendor_id: '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77',
        meta_catalog_id: 'cat_lcsh_007',
        meta_product_retailer_id: 'LCSH-BUILD-LSF',
        title: 'Turnkey Light Frame Steel (LSF) Home Construction',
        description: 'SABS/Agrément certified precision CAD steel framing, 40-60% faster erection, superior thermal R-value insulation.',
        category: 'architectural_builds',
        unit_of_measure: 'per m² build estimate',
        unit_price: 9500.0,
        is_available: true,
      },
      {
        id: '99999999-9999-4999-8999-999999999905',
        vendor_id: '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77',
        meta_catalog_id: 'cat_lcsh_007',
        meta_product_retailer_id: 'LCSH-BUILD-BRICK',
        title: 'Traditional Luxury Brick & Mortar Home Build',
        description: 'Full bespoke architectural residential construction, foundation engineering, council submissions & NHBRC warranty.',
        category: 'architectural_builds',
        unit_of_measure: 'per m² build estimate',
        unit_price: 11500.0,
        is_available: true,
      },
      {
        id: '99999999-9999-4999-8999-999999999906',
        vendor_id: '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77',
        meta_catalog_id: 'cat_lcsh_007',
        meta_product_retailer_id: 'LCSH-STRUCT-ADDS',
        title: 'Pergolas, Carports, Paving, Formwork & Braai Bomas',
        description: 'Specialist construction additions, structural alterations, formwork, paving, covered carports & luxury outdoor entertainment areas.',
        category: 'specialty_construction',
        unit_of_measure: 'custom project quote',
        unit_price: 0.0,
        is_available: true,
      },
    ];

    for (const p of seeded) {
      this.inMemoryProducts.set(p.id, p);
    }
  }

  async saveProduct(product: DbProduct): Promise<DbProduct> {
    const id = product.id || randomUUID();
    const normalizedVendorId =
      product.vendor_id === 'e5fffa99-9e5d-4fe8-992a-2dd8df180e55'
        ? 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55'
        : product.vendor_id;
    const pool = db.getPool();

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
          normalizedVendorId,
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
        if (res.rows[0]) {
          this.inMemoryProducts.set(id, { ...product, id, vendor_id: normalizedVendorId });
          return res.rows[0];
        }
      } catch (err) {
        console.warn('[PostgresProductRepo] DB save fallback:', err);
      }
    }

    const saved = { ...product, id, vendor_id: normalizedVendorId };
    this.inMemoryProducts.set(id, saved);
    return saved;
  }

  async findByRetailerId(retailerId: string): Promise<DbProduct | null> {
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM products WHERE meta_product_retailer_id = $1', [retailerId]);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresProductRepo] FindByRetailerId fallback:', err);
      }
    }

    for (const p of this.inMemoryProducts.values()) {
      if (p.meta_product_retailer_id === retailerId) return p;
    }
    return null;
  }

  async findByVendor(vendorId: string): Promise<DbProduct[]> {
    let normalizedVendorId = vendorId;
    if (vendorId === 'e5fffa99-9e5d-4fe8-992a-2dd8df180e55') {
      normalizedVendorId = 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
    }
    const inMem = Array.from(this.inMemoryProducts.values()).filter((p) => p.vendor_id === normalizedVendorId);
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM products WHERE vendor_id = $1::uuid', [normalizedVendorId]);
        if (res.rows.length > 0) {
          const existingIds = new Set(res.rows.map((r: DbProduct) => r.id));
          const merged = [...inMem.filter((p) => !existingIds.has(p.id)), ...res.rows];
          return merged;
        }
      } catch (err) {
        console.warn('[PostgresProductRepo] FindByVendor fallback:', err);
      }
    }

    return inMem;
  }

  async findById(id: string): Promise<DbProduct | null> {
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM products WHERE id = $1::uuid', [id]);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresProductRepo] FindById fallback:', err);
      }
    }
    const byId = this.inMemoryProducts.get(id);
    if (byId) return byId;
    for (const p of this.inMemoryProducts.values()) {
      if (p.meta_product_retailer_id === id) return p;
    }
    return null;
  }

  async updateProduct(id: string, updates: Partial<DbProduct>): Promise<DbProduct | null> {
    const existing = await this.findById(id);
    const targetId = existing ? existing.id : id;

    const pool = db.getPool();
    if (pool) {
      try {
        const setClauses: string[] = [];
        const values: any[] = [targetId];
        let idx = 2;

        for (const [key, val] of Object.entries(updates)) {
          setClauses.push(`${key} = $${idx}`);
          values.push(key === 'draft_specs' && val ? JSON.stringify(val) : val);
          idx++;
        }

        if (setClauses.length > 0) {
          const sql = `UPDATE products SET ${setClauses.join(', ')} WHERE id = $1::uuid RETURNING *`;
          const res = await pool.query(sql, values);
          if (res.rows[0]) {
            if (existing) {
              this.inMemoryProducts.set(existing.id, { ...existing, ...updates });
            }
            return res.rows[0];
          }
        }
      } catch (err) {
        console.warn('[PostgresProductRepo] Update fallback:', err);
      }
    }

    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.inMemoryProducts.set(existing.id, updated);
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const pool = db.getPool();
    if (pool) {
      try {
        await pool.query('DELETE FROM products WHERE id = $1::uuid', [id]);
      } catch (err) {
        console.warn('[PostgresProductRepo] Delete fallback:', err);
      }
    }
    return this.inMemoryProducts.delete(id);
  }

  async findAll(): Promise<DbProduct[]> {
    return Array.from(this.inMemoryProducts.values());
  }
}

export const postgresProductRepository = new PostgresProductRepository();
