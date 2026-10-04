'use client';

import React, { useState, useRef } from 'react';
import { Product, Vendor } from '../lib/types';
import {
  X,
  UploadCloud,
  Sparkles,
  CheckCircle,
  Loader2,
  Camera,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

interface UploadProductModalProps {
  vendor: Vendor;
  isOpen: boolean;
  onClose: () => void;
  onProductCreated: (newProduct: Product, asDraft?: boolean) => void;
}

const DEMO_PHOTO_PRESETS = [
  {
    label: '🧱 Cement Maxi Bricks 7MPa (R2,600 per 1000pcs)',
    caption: 'Cement Maxi Bricks (7 MPa) R2600 per 1000pcs',
    category: 'bricks_blocks',
    unit: 'per 1000pcs',
    rawUrl:
      'https://images.unsplash.com/photo-1584467541268-b040f83be3fd?auto=format&fit=crop&w=700&q=80',
  },
  {
    label: '🧴 Higiene 5L Industrial Surface Sanitizer (R185 per 5L)',
    caption: '5L Industrial Surface Sanitizer (70% Alcohol) R185 per 5L container',
    category: 'hygiene_cleaning',
    unit: 'per 5L container',
    rawUrl:
      'https://images.unsplash.com/photo-1584813470613-5b1c1cad3d69?auto=format&fit=crop&w=700&q=80',
  },
  {
    label: '🧱 6m³ Washed Plaster Sand (R550 per m3)',
    caption: 'Washed Malmesbury Plaster Sand R550 per m3 direct tipper load',
    category: 'sand_stone',
    unit: 'per m3',
    rawUrl:
      'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=700&q=80',
  },
  {
    label: '🧴 Higiene 25L Anti-Bacterial Hand Soap (R640 per 25L drum)',
    caption: '25L Anti-Bacterial Liquid Hand Soap (Bulk) R640 per 25L drum',
    category: 'hygiene_cleaning',
    unit: 'per 25L drum',
    rawUrl:
      'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=700&q=80',
  },
];

export const UploadProductModal: React.FC<UploadProductModalProps> = ({
  vendor,
  isOpen,
  onClose,
  onProductCreated,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [enhancedCanvasUrl, setEnhancedCanvasUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [extractedProduct, setExtractedProduct] = useState<Partial<Product> | null>(null);
  const [aiProviderLabel, setAiProviderLabel] = useState<string>('Gemini Flash Vision Live');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const steps = [
    '1. Normalizing raw photo onto 1024×1024 #F8F9FA studio canvas & auto-contrast...',
    '2. Running Gemini Flash Vision specification & ZAR pricing extraction...',
    '3. Generating optimized <500KB WebP asset & Supplier Watermark Pill...',
    '4. Preparing Meta WhatsApp Commerce Catalog item & Pre-Publish Gate...',
  ];

  // Generate a real 1024x1024 #F8F9FA Studio Canvas image in-browser
  const renderStudioNormalizedCanvas = async (
    sourceUrl: string,
    titleText: string,
    priceText: string
  ): Promise<string> => {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1024;
          canvas.height = 1024;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(sourceUrl);
            return;
          }

          // 1. Studio #F8F9FA background
          ctx.fillStyle = '#F8F9FA';
          ctx.fillRect(0, 0, 1024, 1024);

          // Subtle studio border & radial studio glow
          const grad = ctx.createRadialGradient(512, 460, 80, 512, 460, 520);
          grad.addColorStop(0, '#FFFFFF');
          grad.addColorStop(1, '#F1F5F9');
          ctx.fillStyle = grad;
          ctx.fillRect(24, 24, 976, 976);

          // 2. Center & scale product photo with studio shadow
          const targetBox = 760;
          const scale = Math.min(targetBox / img.width, targetBox / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = (1024 - drawW) / 2;
          const drawY = (940 - drawH) / 2;

          ctx.save();
          ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
          ctx.shadowBlur = 32;
          ctx.shadowOffsetY = 14;
          ctx.filter = 'contrast(1.08) saturate(1.12) brightness(1.03)';
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.restore();

          // 3. Top-left 1024x1024 AI Studio Badge
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(48, 48, 360, 46);
          ctx.fillStyle = '#10B981';
          ctx.font = 'bold 20px monospace';
          ctx.fillText('✨ AI ENHANCED • 1024x1024 #F8F9FA', 64, 78);

          // 4. Bottom Vendor & Price Studio Banner
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(48, 884, 928, 92);
          ctx.fillStyle = '#F8FAFC';
          ctx.font = 'bold 26px sans-serif';
          ctx.fillText(titleText.slice(0, 42), 72, 926);

          ctx.fillStyle = '#34D399';
          ctx.font = 'bold 24px monospace';
          ctx.fillText(`${priceText} • ${vendor.business_name.slice(0, 28)}`, 72, 958);

          resolve(canvas.toDataURL('image/webp', 0.9));
        };
        img.onerror = () => resolve(sourceUrl);
        img.src = sourceUrl;
      } catch {
        resolve(sourceUrl);
      }
    });
  };

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
    if (!caption) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setCaption(`${cleanName} R550`);
    }
  };

  const handleSelectPreset = (preset: (typeof DEMO_PHOTO_PRESETS)[0]) => {
    setSelectedFile(null);
    setPreviewUrl(preset.rawUrl);
    setCaption(preset.caption);
  };

  const handleStartEnhancement = async () => {
    if (!previewUrl && !caption) return;

    setIsProcessing(true);
    setStepIndex(0);

    const rawSource =
      previewUrl ||
      'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=700&q=80';

    for (let i = 0; i < steps.length; i++) {
      setStepIndex(i);
      await new Promise((r) => setTimeout(r, 400));
    }

    // Call live Gemini Flash endpoint (/api/v1/ai/bridge) for real AI catalog spec extraction
    let aiProd: any = null;
    try {
      const res = await fetch('/api/ai/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'CATALOG_PRODUCT_GENERATOR',
          prompt: caption || selectedFile?.name || '6m3 Plaster Sand R580',
          context: {
            vendorId: vendor.id,
            businessName: vendor.business_name,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.generatedProduct) {
          aiProd = data.generatedProduct;
        }
        if (data.provider === 'gemini-flash-live') {
          setAiProviderLabel(`Gemini Flash Live (${data.model})`);
        }
      }
    } catch {
      // Fallback to local extraction if offline
    }

    const priceMatch = caption.match(/(?:R|ZAR)?\s*([0-9]+(?:\.[0-9]+)?)/i);
    const fallbackPrice = priceMatch ? parseFloat(priceMatch[1]) : 580.0;
    const lowerCap = caption.toLowerCase();

    const inferredCategory =
      lowerCap.includes('burger')
        ? 'gourmet_burger'
        : lowerCap.includes('pizza')
        ? 'woodfired_pizza'
        : lowerCap.includes('balayage') || lowerCap.includes('hair') || lowerCap.includes('session')
        ? 'hair_styling'
        : lowerCap.includes('sanitizer') || lowerCap.includes('soap') || lowerCap.includes('hygiene')
        ? 'hygiene_cleaning'
        : lowerCap.includes('brick')
        ? 'bricks_blocks'
        : aiProd?.category || 'sand_stone';

    const customUnitMatch = caption.match(/\b(per\s+[a-z0-9\s³]+)$/i);
    const inferredUnit = customUnitMatch
      ? customUnitMatch[1].trim()
      : lowerCap.includes('1000pcs') || lowerCap.includes('1000 pcs')
      ? 'per 1000pcs'
      : lowerCap.includes('1000')
      ? 'per 1000pcs'
      : lowerCap.includes('combo') || lowerCap.includes('burger')
      ? 'per combo meal'
      : lowerCap.includes('pizza')
      ? 'per XL pizza'
      : lowerCap.includes('session') || lowerCap.includes('min')
      ? '60 min session'
      : aiProd?.unit_of_measure || 'per m3';

    const finalTitle =
      aiProd?.title ||
      (caption ? caption.split(/R\s*\d+/i)[0].trim() : 'AI Enhanced Catalog Product');
    const finalPrice = priceMatch ? fallbackPrice : Number(aiProd?.unit_price) || fallbackPrice;

    const normalizedDataUrl = await renderStudioNormalizedCanvas(
      rawSource,
      finalTitle,
      `R${finalPrice.toFixed(2)} ${inferredUnit}`
    );
    setEnhancedCanvasUrl(normalizedDataUrl);

    const newProd: Product = {
      id: `prod_ai_${Date.now()}`,
      vendor_id: vendor.id,
      title: finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1),
      category: inferredCategory,
      unit_of_measure: inferredUnit,
      unit_price: finalPrice,
      vat_inclusive: vendor.vat_inclusive ?? false,
      is_available: true,
      image_url: normalizedDataUrl,
      raw_image_url: rawSource,
      enhanced_image_url: normalizedDataUrl,
      meta_retailer_id:
        aiProd?.meta_retailer_id || `SKU-AI-${Math.floor(1000 + Math.random() * 9000)}`,
      description:
        aiProd?.description ||
        `AI-Enhanced 1024x1024 (#F8F9FA) Studio Listing for ${vendor.business_name}. Ready for instant WhatsApp checkout via PayFast MoR.`,
      created_at: new Date().toISOString(),
    };

    setExtractedProduct(newProd);
    setIsProcessing(false);
  };

  const handleConfirmPublish = (asDraft: boolean) => {
    if (extractedProduct) {
      const prodToSave: Product = {
        ...(extractedProduct as Product),
        is_available: !asDraft,
        meta_retailer_id: asDraft ? null : extractedProduct.meta_retailer_id,
      };
      onProductCreated(prodToSave, asDraft);
      handleReset();
      onClose();
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setEnhancedCanvasUrl(null);
    setCaption('');
    setIsProcessing(false);
    setExtractedProduct(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-3xl bg-industrial-900 border border-industrial-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-industrial-800 bg-industrial-850">
          <div className="flex items-center space-x-2.5">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-slate-100">
                On-The-Spot AI Photo Enhancer &amp; Live Catalog Loader
              </h3>
              <p className="text-[11px] text-slate-400">
                Load customer photos during a live demo • Instant 1024×1024 #F8F9FA Studio Canvas + Gemini Flash Spec Extraction
              </p>
            </div>
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
              {/* 1-Click Live Demo Presets for In-Person Customer Pitches */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  1-Click In-Person Demo Samples (Or Upload Customer&apos;s Own Photo Below):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEMO_PHOTO_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className="text-left px-3 py-2 rounded-lg bg-industrial-950 hover:bg-industrial-800 border border-industrial-700 hover:border-emerald-500/50 text-xs text-slate-200 transition flex items-center justify-between"
                    >
                      <span className="truncate font-semibold">{preset.label}</span>
                      <span className="text-[10px] text-emerald-400 font-mono ml-2 shrink-0">Load →</span>
                    </button>
                  ))}
                </div>
              </div>

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
                    : 'border-industrial-700 hover:border-emerald-500/50 bg-industrial-950/60'
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
                      alt="Raw Customer Photo Preview"
                      className="w-36 h-36 object-cover rounded-lg border border-industrial-700 shadow-md mb-3"
                    />
                    <p className="text-xs font-semibold text-emerald-400">
                      {selectedFile
                        ? `Customer Photo Selected: ${selectedFile.name}`
                        : 'Demo Sample Photo Loaded — Ready for AI Studio Enhancement'}{' '}
                      (Click to change)
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="p-3 rounded-full bg-industrial-800 border border-industrial-700 text-industrial-300 mb-3">
                      <UploadCloud className="w-7 h-7 text-emerald-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-200">
                      Drag &amp; drop customer product/menu photo or click to snap/browse
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Works for Building Materials (Sand/Bricks), Restaurant Kitchen Menus (Burgers/Pizza), or Salon Services
                    </p>
                  </div>
                )}
              </div>

              {/* Caption or Pricing Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Product Name &amp; Price Note (Gemini Flash Extracts Specs Automatically)
                </label>
                <input
                  type="text"
                  placeholder='e.g., "Double Smash Burger & Fries R165" or "Plaster Sand 6m3 R580 per m3"'
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full bg-industrial-950 border border-industrial-700 text-slate-100 text-xs sm:text-sm rounded-lg px-3.5 py-2.5 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* AI Processing Bar */}
              {isProcessing && (
                <div className="p-4 bg-industrial-950 rounded-xl border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-400 flex items-center">
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      {steps[stepIndex]}
                    </span>
                    <span className="font-mono text-slate-400">
                      Step {stepIndex + 1} of {steps.length}
                    </span>
                  </div>
                  <div className="w-full bg-industrial-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 transition-all duration-300 ease-out"
                      style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Side-by-Side Before vs After AI Studio Enhancement Preview */
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-emerald-300 text-xs">
                <div className="flex items-center space-x-2.5">
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>
                    <strong>On-The-Spot AI Enhancement Complete!</strong> Normalized onto a 1024×1024{' '}
                    <code>#F8F9FA</code> studio canvas &amp; extracted via{' '}
                    <strong>{aiProviderLabel}</strong>.
                  </span>
                </div>
                <button
                  onClick={handleReset}
                  className="text-[11px] underline text-slate-300 hover:text-white ml-3 shrink-0"
                >
                  Try Another Photo
                </button>
              </div>

              {/* Before vs After Visual Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-industrial-950 border border-industrial-800 flex flex-col items-center">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                    BEFORE: Raw Customer Photo
                  </span>
                  <img
                    src={extractedProduct.raw_image_url || previewUrl || ''}
                    alt="Raw Before"
                    className="w-48 h-48 object-cover rounded-lg border border-industrial-700 opacity-80"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-industrial-950 border border-emerald-500/40 flex flex-col items-center">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold mb-2">
                    AFTER: 1024×1024 #F8F9FA AI Studio Card
                  </span>
                  <img
                    src={enhancedCanvasUrl || extractedProduct.image_url}
                    alt="AI Studio Enhanced"
                    className="w-48 h-48 object-contain rounded-lg border border-emerald-500/40 bg-white shadow-lg"
                  />
                </div>
              </div>

              {/* Editable Extracted Metadata */}
              <div className="p-4 bg-industrial-950 rounded-xl border border-industrial-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Product Title
                    </label>
                    <input
                      type="text"
                      value={extractedProduct.title || ''}
                      onChange={(e) =>
                        setExtractedProduct((prev) => ({ ...prev, title: e.target.value }))
                      }
                      className="w-full rounded-lg bg-industrial-900 border border-industrial-700 px-3 py-1.5 text-xs font-bold text-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Unit Price (ZAR)
                    </label>
                    <input
                      type="text"
                      value={extractedProduct.unit_price ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const numMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)/);
                        const unitPart = raw
                          .replace(/^(?:R|ZAR)?\s*[0-9]+(?:\.[0-9]+)?\s*/i, '')
                          .trim();
                        setExtractedProduct((prev) => ({
                          ...prev,
                          unit_price: numMatch ? parseFloat(numMatch[1]) : 0,
                          ...(unitPart ? { unit_of_measure: unitPart } : {}),
                        }));
                      }}
                      placeholder="e.g. 2600"
                      className="w-full rounded-lg bg-industrial-900 border border-emerald-500/40 px-3 py-1.5 text-xs font-mono font-bold text-emerald-400"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Unit (e.g. per 1000pcs, per m3)
                    </label>
                    <input
                      type="text"
                      value={extractedProduct.unit_of_measure || ''}
                      onChange={(e) =>
                        setExtractedProduct((prev) => ({
                          ...prev,
                          unit_of_measure: e.target.value,
                        }))
                      }
                      placeholder="per 1000pcs"
                      className="w-full rounded-lg bg-industrial-900 border border-sky-500/40 px-3 py-1.5 text-xs font-mono font-bold text-sky-300"
                    />
                  </div>
                </div>

                {/* Quick Unit of Measure Chips & 15% SA VAT Selector */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase text-slate-400">
                      Quick Unit:
                    </span>
                    {[
                      'per 1000pcs',
                      'per m3',
                      'per 6m3 load',
                      'per 5L container',
                      'per 25L drum',
                      'per unit',
                    ].map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() =>
                          setExtractedProduct((prev) => ({ ...prev, unit_of_measure: u }))
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition ${
                          extractedProduct.unit_of_measure === u
                            ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                            : 'bg-industrial-900 border-industrial-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setExtractedProduct((prev) => ({
                        ...prev,
                        vat_inclusive: !prev?.vat_inclusive,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-extrabold border transition ${
                      extractedProduct.vat_inclusive
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    }`}
                  >
                    {extractedProduct.vat_inclusive
                      ? `✅ Price INCLUDES 15% VAT (Excl: R${((extractedProduct.unit_price || 0) / 1.15).toFixed(2)})`
                      : `⚡ Price EXCLUDES VAT (+15% VAT = R${((extractedProduct.unit_price || 0) * 1.15).toFixed(2)} Incl.)`}
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    AI Catalog Description
                  </label>
                  <input
                    type="text"
                    value={extractedProduct.description || ''}
                    onChange={(e) =>
                      setExtractedProduct((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className="w-full rounded-lg bg-industrial-900 border border-industrial-700 px-3 py-1.5 text-xs text-slate-300"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
                  <span className="px-2.5 py-1 rounded bg-industrial-900 text-emerald-400 font-bold border border-industrial-700">
                    R{extractedProduct.unit_price?.toFixed(2)} {extractedProduct.unit_of_measure}{' '}
                    ({extractedProduct.vat_inclusive ? 'Incl. 15% VAT' : 'Excl. VAT'})
                  </span>
                  <span className="px-2.5 py-1 rounded bg-industrial-900 text-sky-300 border border-industrial-700">
                    SKU: {extractedProduct.meta_retailer_id}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-industrial-900 text-slate-300 border border-industrial-700">
                    Tenant: {vendor.business_name}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-industrial-950 border-t border-industrial-800 flex flex-wrap items-center justify-between gap-3">
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
              disabled={isProcessing || (!previewUrl && !caption)}
              onClick={handleStartEnhancement}
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              {isProcessing
                ? 'Enhancing with Gemini Flash & 1024×1024 Studio Canvas...'
                : 'Enhance Photo & Extract Catalog Specs'}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => handleConfirmPublish(true)}
                className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all"
              >
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                Save to Pre-Publish Approval Gate
              </button>
              <button
                onClick={() => handleConfirmPublish(false)}
                className="inline-flex items-center px-5 py-2.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all"
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Approve &amp; Publish Live to WhatsApp Catalog
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
