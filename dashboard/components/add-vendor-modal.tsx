'use client';

import React, { useState } from 'react';
import { Vendor, VendorSubscriptionTier } from '../lib/types';
import {
  X,
  Building2,
  Phone,
  Landmark,
  MapPin,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

interface AddVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVendorCreated: (newVendor: Vendor, openCatalogUploadImmediately: boolean) => void;
}

export const AddVendorModal: React.FC<AddVendorModalProps> = ({
  isOpen,
  onClose,
  onVendorCreated,
}) => {
  const [businessName, setBusinessName] = useState('Higiene Commercial Hygiene & Cleaning (Pty) Ltd');
  const [whatsappNumber, setWhatsappNumber] = useState('+27600104005');
  const [businessType, setBusinessType] = useState<'retail_delivery' | 'service_booking'>('retail_delivery');
  const [subscriptionTier, setSubscriptionTier] = useState<VendorSubscriptionTier>('pro');
  const [contactEmail, setContactEmail] = useState('orders@higiene.co.za');
  const [vatNumber, setVatNumber] = useState('ZA4950112233');
  const [bankName, setBankName] = useState('First National Bank (FNB)');
  const [bankAccountNumber, setBankAccountNumber] = useState('62991100442');
  const [bankBranchCode, setBankBranchCode] = useState('250655');
  const [baseDeliveryFee, setBaseDeliveryFee] = useState<number>(85);
  const [perKmRate, setPerKmRate] = useState<number>(8.5);
  const [maxRadiusKm, setMaxRadiusKm] = useState<number>(35);

  if (!isOpen) return null;

  const tierMap: Record<
    VendorSubscriptionTier,
    { monthlyFee: number; commissionRate: number; label: string }
  > = {
    starter: { monthlyFee: 299, commissionRate: 0.08, label: 'Starter (R299/mo • 8.0% comm)' },
    pro: { monthlyFee: 599, commissionRate: 0.065, label: 'Pro Fleet (R599/mo • 6.5% comm)' },
    enterprise: { monthlyFee: 999, commissionRate: 0.05, label: 'Enterprise (R999/mo • 5.0% comm)' },
  };

  const handleSubmit = (openCatalogAfter: boolean) => {
    if (!businessName.trim()) return;

    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const tierInfo = tierMap[subscriptionTier];
    const randSuffix = Math.floor(100 + Math.random() * 900);

    const newVendor: Vendor = {
      id: `vnd_${slug}_${Date.now().toString().slice(-4)}`,
      business_name: businessName.trim(),
      slug,
      whatsapp_number: whatsappNumber.trim() || `+27600104${randSuffix}`,
      meta_phone_number_id: `meta_pnum_${slug.slice(0, 10)}_${randSuffix}`,
      meta_catalog_id: `cat_${slug.slice(0, 10)}_${randSuffix}`,
      business_type: businessType,
      contact_email: contactEmail.trim(),
      vat_number: vatNumber.trim(),
      bank_account_holder: businessName.trim(),
      bank_name: bankName,
      bank_account_number: bankAccountNumber.trim() || '62000000000',
      bank_branch_code: bankBranchCode.trim() || '250655',
      base_location_lon: 28.0473,
      base_location_lat: -26.2041,
      max_delivery_radius_km: businessType === 'service_booking' ? 0 : Number(maxRadiusKm) || 35,
      base_delivery_fee: businessType === 'service_booking' ? 0 : Number(baseDeliveryFee) || 85,
      per_km_rate: businessType === 'service_booking' ? 0 : Number(perKmRate) || 8.5,
      commission_rate: tierInfo.commissionRate,
      subscription_tier: subscriptionTier,
      subscription_monthly_fee: tierInfo.monthlyFee,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    onVendorCreated(newVendor, openCatalogAfter);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-2xl obsidian-card rounded-2xl border border-emerald-500/40 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display">
                Onboard New Customer / Vendor Company (Multi-Tenant MoR)
              </h3>
              <p className="text-[11px] text-slate-400">
                Creates an isolated WhatsApp Virtual Number, Meta Catalog ID &amp; PayFast MoR Sub-Ledger
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-xs">
          {/* Quick Preset Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Ready to test onboarding <strong>Higiene</strong> right now (pre-filled below, or edit any field):
            </span>
            <button
              type="button"
              onClick={() => {
                setBusinessName('Higiene Commercial Hygiene & Cleaning (Pty) Ltd');
                setWhatsappNumber('+27600104005');
                setContactEmail('orders@higiene.co.za');
                setBusinessType('retail_delivery');
                setSubscriptionTier('pro');
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold text-[11px] hover:bg-emerald-400 transition"
            >
              Reset to &ldquo;Higiene&rdquo; Preset
            </button>
          </div>

          {/* 1. Business Name & WhatsApp Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-300 font-bold mb-1.5">
                Company / Customer Name *
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Higiene Cleaning & Hygiene Supplies"
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm font-bold text-white focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-300 font-bold mb-1.5">
                Dedicated WhatsApp Virtual Number *
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+27600104005"
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 pl-9 pr-3.5 py-2.5 text-sm font-mono font-bold text-emerald-300 focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 2. Business Type & SaaS Tier */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-300 font-bold mb-1.5">
                Operational Vertical &amp; Dispatch Mode
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as any)}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-xs font-bold text-white focus:border-emerald-400 focus:outline-none"
              >
                <option value="retail_delivery">
                  🚚 Product Catalog &amp; Delivery (Hygiene, Materials, Food)
                </option>
                <option value="service_booking">
                  📅 Service &amp; Appointment Booking (R0 Delivery Fee)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-300 font-bold mb-1.5">
                Monthly SaaS Subscription Tier
              </label>
              <select
                value={subscriptionTier}
                onChange={(e) => setSubscriptionTier(e.target.value as VendorSubscriptionTier)}
                className="w-full rounded-xl bg-slate-950 border border-emerald-500/40 px-3.5 py-2.5 text-xs font-bold text-emerald-300 focus:border-emerald-400 focus:outline-none"
              >
                <option value="starter">Starter — R299/mo (8.0% MoR Commission)</option>
                <option value="pro">Pro Fleet — R599/mo (6.5% MoR Commission)</option>
                <option value="enterprise">Enterprise — R999/mo (5.0% MoR Commission)</option>
              </select>
            </div>
          </div>

          {/* 3. PostGIS Delivery Pricing */}
          {businessType === 'retail_delivery' && (
            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5">
              <div className="text-[11px] font-mono uppercase text-sky-400 font-bold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Automated WhatsApp GPS Pin Delivery Formula
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Base Dispatch Fee (R)</label>
                  <input
                    type="number"
                    value={baseDeliveryFee}
                    onChange={(e) => setBaseDeliveryFee(Number(e.target.value))}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Rate per km (R/km)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={perKmRate}
                    onChange={(e) => setPerKmRate(Number(e.target.value))}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Max Radius (km)</label>
                  <input
                    type="number"
                    value={maxRadiusKm}
                    onChange={(e) => setMaxRadiusKm(Number(e.target.value))}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 4. Payout Bank Account Details for Weekly EFT Batch */}
          <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5">
            <div className="text-[11px] font-mono uppercase text-amber-300 font-bold flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5" />
              Vendor Settlement Bank Details (For Weekly Friday EFT Payouts)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Bank Name</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white"
                >
                  <option value="First National Bank (FNB)">First National Bank (FNB)</option>
                  <option value="Capitec Business">Capitec Business</option>
                  <option value="Standard Bank of South Africa">Standard Bank</option>
                  <option value="Nedbank">Nedbank</option>
                  <option value="ABSA Bank">ABSA Bank</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Account Number</label>
                <input
                  type="text"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Branch Code</label>
                <input
                  type="text"
                  value={bankBranchCode}
                  onChange={(e) => setBankBranchCode(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 font-mono text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Cancel
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 transition flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Create Company Only
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(true)}
              className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg glow-emerald transition flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              Create &ldquo;{businessName.split(' ')[0]}&rdquo; &amp; Load AI Catalog Now →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
