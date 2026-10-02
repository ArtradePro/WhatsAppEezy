import { ProductRecord } from '../../types/product.types';

export interface IProductRepository {
  save(product: ProductRecord): Promise<ProductRecord>;
  findById(id: string): Promise<ProductRecord | null>;
  findByRetailerId(retailerId: string): Promise<ProductRecord | null>;
  findAll(): Promise<ProductRecord[]>;
  update(id: string, partial: Partial<ProductRecord>): Promise<ProductRecord | null>;
}

export class InMemoryProductRepository implements IProductRepository {
  private products: Map<string, ProductRecord> = new Map();

  async save(product: ProductRecord): Promise<ProductRecord> {
    this.products.set(product.id, { ...product });
    return { ...product };
  }

  async findById(id: string): Promise<ProductRecord | null> {
    const product = this.products.get(id);
    return product ? { ...product } : null;
  }

  async findByRetailerId(retailerId: string): Promise<ProductRecord | null> {
    for (const prod of this.products.values()) {
      if (prod.retailerId === retailerId) {
        return { ...prod };
      }
    }
    return null;
  }

  async findAll(): Promise<ProductRecord[]> {
    return Array.from(this.products.values());
  }

  async update(id: string, partial: Partial<ProductRecord>): Promise<ProductRecord | null> {
    const existing = this.products.get(id);
    if (!existing) return null;

    const updated: ProductRecord = {
      ...existing,
      ...partial,
      updatedAt: new Date().toISOString(),
    };

    this.products.set(id, updated);
    return { ...updated };
  }
}

export const productRepository = new InMemoryProductRepository();
