"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productRepository = exports.InMemoryProductRepository = void 0;
class InMemoryProductRepository {
    products = new Map();
    async save(product) {
        this.products.set(product.id, { ...product });
        return { ...product };
    }
    async findById(id) {
        const product = this.products.get(id);
        return product ? { ...product } : null;
    }
    async findByRetailerId(retailerId) {
        for (const prod of this.products.values()) {
            if (prod.retailerId === retailerId) {
                return { ...prod };
            }
        }
        return null;
    }
    async findAll() {
        return Array.from(this.products.values());
    }
    async update(id, partial) {
        const existing = this.products.get(id);
        if (!existing)
            return null;
        const updated = {
            ...existing,
            ...partial,
            updatedAt: new Date().toISOString(),
        };
        this.products.set(id, updated);
        return { ...updated };
    }
}
exports.InMemoryProductRepository = InMemoryProductRepository;
exports.productRepository = new InMemoryProductRepository();
//# sourceMappingURL=product-repository.js.map