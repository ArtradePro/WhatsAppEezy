'use client';

import React, { useState } from 'react';
import { Product, Vendor } from '../lib/types';
import {
  Smartphone,
  ShieldCheck,
  MapPin,
  Sparkles,
  CheckCheck,
  Send,
  ShoppingBag,
  ArrowUpRight,
  Camera,
  CreditCard,
  Flame,
  Truck,
} from 'lucide-react';

interface LiveWhatsAppDemoCockpitProps {
  vendor: Vendor;
  products: Product[];
  onOpenAiPhotoModal: () => void;
  onTriggerLiveOrder: () => void;
}

export const LiveWhatsAppDemoCockpit: React.FC<LiveWhatsAppDemoCockpitProps> = ({
  vendor,
  products,
  onOpenAiPhotoModal,
  onTriggerLiveOrder,
}) => {
  const [selectedSkuIndex, setSelectedSkuIndex] = useState(0);
  const [quantity, setQuantity] = useState(2);

  const isKitchen =
    vendor.business_name.toLowerCase().includes('kitchen') ||
    vendor.business_name.toLowerCase().includes('pizza');
  const isSalon = vendor.business_type === 'service_booking';

  const vendorProducts = products.filter((p) => p.vendor_id === vendor.id && p.is_available);
  const displayProducts = vendorProducts.length > 0 ? vendorProducts : products.slice(0, 3);
  const activeProduct = displayProducts[selectedSkuIndex % displayProducts.length] || products[0];

  const unitPrice = activeProduct?.unit_price || (isKitchen ? 165 : 550);
  const subtotal = unitPrice * quantity;
  const sampleDistanceKm = isKitchen ? 3.4 : 14.2;
  const deliveryFee = isSalon
    ? 0
    : Math.round(((vendor.base_delivery_fee ?? 85) + (vendor.per_km_rate ?? 8.5) * sampleDistanceKm) * 100) / 100;
  const totalZar = subtotal + deliveryFee;

  return (
    <div className="obsidian-card rounded-2xl p-6 border border-emerald-500/25 relative overflow-hidden">
      {/* Ambient Corner Glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-center relative z-10">
        {/* Left 7 Columns: Interactive In-Person Sales Pitch Storyboard */}
        <div className="lg:col-span-7 space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Live In-Person Customer Demo Cockpit • End-to-End Pipeline
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-display">
              Pitch, Load AI Catalog &amp; Fire Dispatch Tickets Live
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
              Show your prospective client how their customers order on WhatsApp ({' '}
              <span className="font-mono text-emerald-300 font-semibold">
                {vendor.whatsapp_number}
              </span>{' '}
              ), how photos are enhanced onto a <code className="text-sky-300">1024×1024 #F8F9FA</code>{' '}
              studio canvas on the spot, how PayFast settles into your Master Merchant Account, and how{' '}
              <strong className="text-white">
                {isKitchen
                  ? 'Kitchen Order Tickets (KOT)'
                  : isSalon
                  ? '10-Min Slot Bookings'
                  : 'SABS Weighbridge Tipper Slips'}
              </strong>{' '}
              print automatically.
            </p>
          </div>

          {/* 3-Step Interactive Demo Flow Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Step 1: AI Photo Catalog Load */}
            <div
              onClick={onOpenAiPhotoModal}
              className="group cursor-pointer rounded-xl p-4 bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    STEP 01 // CATALOG
                  </span>
                  <Camera className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                </div>
                <div className="font-bold text-sm text-white group-hover:text-emerald-300 transition-colors">
                  Snap &amp; AI-Enhance Photo
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Upload a raw burger, pizza, or sand photo. Gemini Flash extracts specs &amp; builds a 1024×1024 card.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-emerald-400">
                <span>Launch AI Studio</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Step 2: WhatsApp Checkout & Master MoR */}
            <div
              onClick={onTriggerLiveOrder}
              className="group cursor-pointer rounded-xl p-4 bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-sky-500/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                    STEP 02 // PAYFAST MoR
                  </span>
                  <CreditCard className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
                </div>
                <div className="font-bold text-sm text-white group-hover:text-sky-300 transition-colors">
                  WhatsApp Checkout &amp; Split
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Customer pays via PayFast Instant EFT into your Master MoR account with 4-line ledger split.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-sky-400">
                <span>Simulate Payment</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Step 3: Instant Kitchen / Yard Ticket */}
            <div
              onClick={onTriggerLiveOrder}
              className="group cursor-pointer rounded-xl p-4 bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    STEP 03 // DISPATCH
                  </span>
                  {isKitchen ? (
                    <Flame className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                  ) : (
                    <Truck className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                  )}
                </div>
                <div className="font-bold text-sm text-white group-hover:text-amber-300 transition-colors">
                  {isKitchen ? 'Print Kitchen Ticket (KOT)' : 'Print Tipper Loading Slip'}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {isKitchen
                    ? 'Fires Hot-Pass Grill Ticket with burger/pizza modifiers & tamper seal.'
                    : 'Fires SABS Weighbridge Waybill with tonnage & tipper truck allocation.'}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-amber-400">
                <span>Fire Live Ticket</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Interactive Product Selector for the Phone Preview */}
          <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-300">
                Previewing Customer WhatsApp Cart for:
              </span>
              <select
                aria-label="Select Catalog Item to Preview in Phone"
                value={selectedSkuIndex}
                onChange={(e) => setSelectedSkuIndex(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-300 focus:outline-none"
              >
                {displayProducts.map((p, i) => (
                  <option key={p.id} value={i}>
                    {p.title} (R{p.unit_price})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">Qty:</span>
              {[1, 2, 6, 10].map((q) => (
                <button
                  key={q}
                  onClick={() => setQuantity(q)}
                  className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition ${
                    quantity === q
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Realistic iPhone WhatsApp Business Handset Simulator */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[360px] rounded-[34px] p-2.5 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950 shadow-[0_25px_70px_-15px_rgba(16,185,129,0.28)] border border-slate-600/60">
            <div className="rounded-[26px] overflow-hidden bg-[#0b141a] border border-slate-900 flex flex-col">
              {/* WhatsApp Top Bar */}
              <div className="bg-[#1f2c34] px-4 py-3 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white font-black text-xs shadow">
                    {vendor.business_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1">
                      <span className="truncate max-w-[165px]">{vendor.business_name}</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono">
                      Official WhatsApp Catalog • {vendor.whatsapp_number}
                    </div>
                  </div>
                </div>
                <ShoppingBag className="w-4 h-4 text-slate-300" />
              </div>

              {/* WhatsApp Chat Stream */}
              <div className="whatsapp-dark-wallpaper p-3.5 space-y-2.5 text-xs max-h-[340px] overflow-y-auto">
                {/* Interactive Catalog Card Bubble */}
                <div className="bg-[#1f2c34] rounded-xl p-2.5 border border-white/5 shadow-md max-w-[92%]">
                  <div className="flex gap-2.5 items-center">
                    <img
                      src={
                        activeProduct?.image_url ||
                        'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=400&q=80'
                      }
                      alt={activeProduct?.title}
                      className="w-14 h-14 rounded-lg object-cover border border-white/10 shrink-0 bg-white"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        1024×1024 AI Studio
                      </span>
                      <div className="font-bold text-white truncate mt-0.5 text-xs">
                        {activeProduct?.title}
                      </div>
                      <div className="text-emerald-400 font-mono font-bold text-[11px]">
                        R {unitPrice.toFixed(2)} <span className="text-slate-400 font-normal">/ {activeProduct?.unit_of_measure}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Outbound Customer Order Bubble */}
                <div className="ml-auto bg-[#005c4b] text-white rounded-xl rounded-tr-none px-3 py-2 max-w-[85%] shadow">
                  <div className="font-semibold text-[11px]">
                    🛒 Order: {quantity} × {activeProduct?.title}
                  </div>
                  <div className="text-[10px] text-emerald-100/90 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {isKitchen
                      ? 'Pin: Rosebank Penthouse (3.4 km)'
                      : isSalon
                      ? 'Slot: Tomorrow 09:00 AM (R0 Delivery)'
                      : 'Pin: Stand 402, Albertinia Site (14.2 km)'}
                  </div>
                  <div className="text-[9px] text-emerald-200/70 text-right flex items-center justify-end gap-1 mt-0.5">
                    <span>Just now</span>
                    <CheckCheck className="w-3 h-3 text-sky-300" />
                  </div>
                </div>

                {/* Inbound Bot PayFast Checkout Bubble */}
                <div className="bg-[#1f2c34] text-slate-100 rounded-xl rounded-tl-none p-3 max-w-[92%] border border-emerald-500/30 shadow-lg space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400">
                    <span>⚡ MASTER PAYFAST MoR CHECKOUT</span>
                    <span>VERIFIED</span>
                  </div>
                  <div className="text-[11px] space-y-0.5 text-slate-300 font-mono">
                    <div className="flex justify-between">
                      <span>Subtotal ({quantity}x):</span>
                      <span>R {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{isSalon ? 'Appointment Hold:' : 'PostGIS Delivery:'}</span>
                      <span>R {deliveryFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-white border-t border-white/10 pt-1 text-xs">
                      <span>Total Due:</span>
                      <span className="text-emerald-400">R {totalZar.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    onClick={onTriggerLiveOrder}
                    className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md transition transform active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Pay R {totalZar.toFixed(2)} &amp; Fire {isKitchen ? 'Kitchen KOT' : 'Yard Slip'}
                  </button>
                </div>
              </div>

              {/* Bottom Input Pill */}
              <div className="bg-[#1f2c34] px-3 py-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-white/5">
                <span className="truncate">Zero-App WhatsApp Cloud API...</span>
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
