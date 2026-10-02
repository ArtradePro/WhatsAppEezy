'use client';

import React, { useState, useRef } from 'react';
import { Product, Vendor } from '../lib/types';
import {
  X,
  UploadCloud,
  Sparkles,
  CheckCircle,
  Loader2,
  Image as ImageIcon,
  Tag,
  DollarSign,
  Layers,
} from 'lucide-react';

interface UploadProductModalProps {
  vendor: Vendor;
  isOpen: boolean;
  onClose: () => void;
  onProductCreated: (newProduct: Product) => void;
}

export const UploadProductModal: React.FC<UploadProductModalProps> = ({
  vendor,
  isOpen,
  onClose,
  onProductCreated,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [extractedProduct, setExtractedProduct] = useState<Partial<Product> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const steps = [
    '1. Removing photo noise & padding 1024x1024 white canvas...',
    '2. GPT-4o Vision specification & pricing extraction...',
    '3. Uploading master image to Cloudinary CDN...',
    '4. Pushing live to Meta WhatsApp Commerce Catalog...',
  ];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleStartEnhancement = async () => {
    if (!selectedFile && !caption) return;

    setIsProcessing(true);
    setStepIndex(0);

    // Simulate multi-step AI pipeline progress
    for (let i = 0; i < steps.length; i++) {
      setStepIndex(i);
      await new Promise((r) => setTimeout(r, 650));
    }

    // Extracted AI attributes based on caption or file name
    const simulatedTitle = caption
      ? caption.split('R')[0].trim() || 'Dry Screened Plaster Sand'
      : selectedFile?.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Coarse Sand Aggregate';

    const priceMatch = caption.match(/R\s*([0-9]+(?:\.[0-9]+)?)/i);
    const simulatedPrice = priceMatch ? parseFloat(priceMatch[1]) : 580.0;

    const newProd: Product = {
      id: `prod_ai_${Date.now()}`,
      vendor_id: vendor.id,
      title: simulatedTitle.charAt(0).toUpperCase() + simulatedTitle.slice(1),
      category: 'sand_stone',
      unit_of_measure: 'm³ (Cubic Meter)',
      unit_price: simulatedPrice,
      is_available: true,
      image_url:
        previewUrl ||
        'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80',
      meta_retailer_id: `MAT-AI-${Math.floor(1000 + Math.random() * 9000)}`,
      description: 'Standardized quarry material extracted with GPT-4o Vision & Sharp canvas branding.',
      created_at: new Date().toISOString(),
    };

    setExtractedProduct(newProd);
    setIsProcessing(false);
  };

  const handleConfirmPublish = () => {
    if (extractedProduct) {
      onProductCreated(extractedProduct as Product);
      handleReset();
      onClose();
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption('');
    setIsProcessing(false);
    setExtractedProduct(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-2xl bg-industrial-900 border border-industrial-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-industrial-800 bg-industrial-850">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-slate-100">
              AI Vision Product Upload & Meta Catalog Push
            </h3>
          </div>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="p-1.5 rounded-lg text-industrial-400 hover:text-slate-100 hover:bg-industrial-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {!extractedProduct ? (
            <>
              {/* Drag and Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-industrial-700 hover:border-industrial-600 bg-industrial-850/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="flex flex-col items-center">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-36 h-36 object-cover rounded-lg border border-industrial-700 shadow-md mb-3"
                    />
                    <p className="text-xs font-semibold text-emerald-400">
                      Photo Selected: {selectedFile?.name} (Click to change)
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="p-3 rounded-full bg-industrial-800 border border-industrial-700 text-industrial-300 mb-3">
                      <UploadCloud className="w-7 h-7 text-emerald-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-200">
                      Drag & drop quarry material photo or click to browse
                    </p>
                    <p className="text-xs text-industrial-400 mt-1">
                      Direct WhatsApp supplier snaps, stockpile photos, or maxi brick stacks
                    </p>
                  </div>
                )}
              </div>

              {/* Caption or Pricing Override */}
              <div>
                <label className="block text-xs font-semibold text-industrial-300 uppercase tracking-wider mb-1.5">
                  Supplier Caption or Price Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder='e.g., "Plaster sand direct tipper loads R580 per cube"'
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full bg-industrial-850 border border-industrial-700 text-slate-100 text-xs sm:text-sm rounded-lg px-3.5 py-2.5 placeholder-industrial-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* AI Processing Bar */}
              {isProcessing && (
                <div className="p-4 bg-industrial-850 rounded-xl border border-industrial-700 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-400 flex items-center">
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      {steps[stepIndex]}
                    </span>
                    <span className="font-mono text-industrial-400">
                      Step {stepIndex + 1} of {steps.length}
                    </span>
                  </div>
                  <div className="w-full bg-industrial-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 transition-all duration-500 ease-out"
                      style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* AI Extracted Instant Preview */
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center space-x-3 text-emerald-300 text-xs">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  Vision AI successfully extracted specifications and formatted 1024x1024 product card!
                </span>
              </div>

              <div className="p-4 bg-industrial-850 rounded-xl border border-industrial-700 flex flex-col sm:flex-row items-center gap-4">
                <img
                  src={extractedProduct.image_url}
                  alt={extractedProduct.title}
                  className="w-28 h-28 object-cover rounded-lg border border-industrial-700 shrink-0"
                />
                <div className="space-y-1.5 text-xs sm:text-sm flex-1">
                  <div className="font-bold text-base text-slate-100">{extractedProduct.title}</div>
                  <div className="text-industrial-400">{extractedProduct.description}</div>
                  <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
                    <span className="px-2 py-0.5 rounded bg-industrial-800 text-emerald-400 font-bold border border-industrial-700">
                      R{extractedProduct.unit_price?.toFixed(2)} / {extractedProduct.unit_of_measure}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-industrial-800 text-industrial-300 border border-industrial-700">
                      Ref: {extractedProduct.meta_retailer_id}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-industrial-850 border-t border-industrial-800 flex items-center justify-between">
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-industrial-800 hover:bg-industrial-700 text-slate-300 transition-colors"
          >
            Cancel
          </button>

          {!extractedProduct ? (
            <button
              disabled={isProcessing || (!selectedFile && !caption)}
              onClick={handleStartEnhancement}
              className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              {isProcessing ? 'Processing with AI...' : 'Run Vision AI & Enhance'}
            </button>
          ) : (
            <button
              onClick={handleConfirmPublish}
              className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all"
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Approve & Publish to WhatsApp Catalog
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
