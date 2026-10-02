'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../lib/types';
import {
  Package,
  Plus,
  Check,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  ExternalLink,
} from 'lucide-react';

interface QuickCatalogProps {
  products: Product[];
  onToggleStock: (productId: string, isAvailable: boolean) => Promise<void>;
  onUpdatePrice: (productId: string, newPrice: number) => Promise<void>;
  onOpenUploadModal: () => void;
}

export const QuickCatalog: React.FC<QuickCatalogProps> = ({
  products,
  onToggleStock,
  onUpdatePrice,
  onOpenUploadModal,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);
  const [savedPriceId, setSavedPriceId] = useState<string | null>(null);
  const [togglingStockId, setTogglingStockId] = useState<string | null>(null);

  // Debounce timers
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    const initialPrices: Record<string, string> = {};
    products.forEach((p) => {
      initialPrices[p.id] = p.unit_price.toString();
    });
    setPrices(initialPrices);
  }, [products]);

  const handlePriceInputChange = (productId: string, value: string) => {
    setPrices((prev) => ({ ...prev, [productId]: value }));

    if (debounceTimers.current[productId]) {
      clearTimeout(debounceTimers.current[productId]);
    }

    debounceTimers.current[productId] = setTimeout(async () => {
      const numVal = parseFloat(value);
      if (!isNaN(numVal) && numVal > 0) {
        setSavingPriceId(productId);
        await onUpdatePrice(productId, numVal);
        setSavingPriceId(null);
        setSavedPriceId(productId);
        setTimeout(() => setSavedPriceId(null), 2000);
      }
    }, 600);
  };

  const handleStockToggle = async (productId: string, currentStatus: boolean) => {
    setTogglingStockId(productId);
    try {
      await onToggleStock(productId, !currentStatus);
    } finally {
      setTogglingStockId(null);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.unit_of_measure.toLowerCase().includes(search.toLowerCase()) ||
      (p.meta_retailer_id && p.meta_retailer_id.toLowerCase().includes(search.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="bg-industrial-900 border border-industrial-800 rounded-xl overflow-hidden shadow-sm">
      {/* Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-industrial-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Package className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">Live Yard Catalog & Instant Pricing</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-industrial-800 text-industrial-300 border border-industrial-700">
              {filteredProducts.length} items
            </span>
          </div>
          <p className="text-xs text-industrial-400 mt-1">
            Price edits and stock toggles patch directly to the Meta Commerce Manager Catalog and WhatsApp interactive lists.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-industrial-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search catalog materials..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-56 bg-industrial-850 border border-industrial-700 text-slate-100 text-xs rounded-lg pl-9 pr-3 py-2 placeholder-industrial-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Category Select */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-industrial-850 border border-industrial-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="sand_stone">Sand & Stone Aggregates</option>
            <option value="bricks_blocks">Bricks & Maxi Blocks</option>
            <option value="cement">Cement</option>
            <option value="hardware">Hardware & Roadbase</option>
          </select>

          {/* Upload New Product Button */}
          <button
            onClick={onOpenUploadModal}
            className="inline-flex items-center justify-center px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-colors"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Upload Product
          </button>
        </div>
      </div>

      {/* Product Cards Grid */}
      <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map((product) => {
          const isToggling = togglingStockId === product.id;
          const isSavingPrice = savingPriceId === product.id;
          const isSavedPrice = savedPriceId === product.id;

          return (
            <div
              key={product.id}
              className={`bg-industrial-850 border rounded-xl p-4 flex flex-col justify-between transition-all ${
                product.is_available
                  ? 'border-industrial-700/80 hover:border-industrial-600'
                  : 'border-industrial-800 opacity-70 bg-industrial-900/80'
              }`}
            >
              <div>
                {/* Image & Stock Badge */}
                <div className="relative w-full h-40 rounded-lg overflow-hidden bg-industrial-800 mb-3 border border-industrial-700/60">
                  <img
                    src={product.image_url}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        product.is_available
                          ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-700/60'
                          : 'bg-rose-950/90 text-rose-400 border border-rose-700/60'
                      }`}
                    >
                      {product.is_available ? 'In Stock' : 'Out of Stock'}
                    </span>
                  </div>
                </div>

                {/* Title & Ref */}
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-sm text-slate-100 line-clamp-1">{product.title}</h3>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-industrial-400 font-mono">
                    <span>{product.meta_retailer_id || 'CAT-REF-01'}</span>
                    <span>•</span>
                    <span className="capitalize">{product.category.replace('_', ' ')}</span>
                  </div>
                </div>
              </div>

              {/* Price & Inline Stock Toggle */}
              <div className="mt-4 pt-3 border-t border-industrial-700/80 space-y-3">
                {/* Editable Price Input with Debounce */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-industrial-300 mb-1">
                    <span>Unit Price (ZAR):</span>
                    {isSavingPrice && (
                      <span className="text-emerald-400 flex items-center text-[10px]">
                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Patching Meta...
                      </span>
                    )}
                    {isSavedPrice && (
                      <span className="text-emerald-400 flex items-center text-[10px]">
                        <Check className="w-3 h-3 mr-1" /> Patched & Synced
                      </span>
                    )}
                  </div>

                  <div className="relative flex items-center">
                    <span className="absolute left-3 font-bold text-xs text-industrial-400">R</span>
                    <input
                      type="number"
                      step="any"
                      value={prices[product.id] ?? product.unit_price}
                      onChange={(e) => handlePriceInputChange(product.id, e.target.value)}
                      className="w-full bg-industrial-900 border border-industrial-700 text-slate-100 font-mono font-bold text-sm rounded-lg pl-7 pr-16 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 text-[10px] font-medium text-industrial-400 truncate max-w-[80px]">
                      {product.unit_of_measure}
                    </span>
                  </div>
                </div>

                {/* In Stock / Out of Stock Switch */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium text-slate-300">Available for WhatsApp Orders</span>
                  <button
                    disabled={isToggling}
                    onClick={() => handleStockToggle(product.id, product.is_available)}
                    className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      product.is_available ? 'bg-emerald-500' : 'bg-industrial-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        product.is_available ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
