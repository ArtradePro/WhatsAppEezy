'use client';

import React, { useState, useEffect } from 'react';
import { Vendor, VendorBusinessType, VendorSubscriptionTier } from '../lib/types';
import {
  X,
  Building2,
  Phone,
  MapPin,
  Landmark,
  Truck,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { GpsPinDropMap } from './gps-pindrop-map';

interface EditVendorModalProps {
  vendor: Vendor;
  isOpen: boolean;
  onClose: () => void;
  onVendorUpdated: (updatedVendor: Vendor) => void;
}

const SA_LOCATION_PRESETS = [
  { label: 'Mossel Bay / Garden Route', lat: -34.1831, lon: 22.1465 },
  { label: 'Albertinia Industrial', lat: -34.2056, lon: 21.5801 },
  { label: 'George Industrial', lat: -33.963, lon: 22.4617 },
  { label: 'Johannesburg (City Deep)', lat: -26.2041, lon: 28.0473 },
  { label: 'Cape Town (Bellville)', lat: -33.8715, lon: 18.5186 },
  { label: 'Pretoria / Centurion', lat: -25.7479, lon: 28.2293 },
];

export const EditVendorModal: React.FC<EditVendorModalProps> = ({
  vendor,
  isOpen,
  onClose,
  onVendorUpdated,
}) => {
  const [businessName, setBusinessName] = useState(vendor.business_name);
  const [whatsappNumber, setWhatsappNumber] = useState(vendor.whatsapp_number);
  const [businessType, setBusinessType] = useState<VendorBusinessType>(
    vendor.business_type || 'retail_delivery'
  );
  const [subscriptionTier, setSubscriptionTier] = useState<VendorSubscriptionTier>(
    vendor.subscription_tier || 'pro'
  );
  const [contactEmail, setContactEmail] = useState(vendor.contact_email || '');
  const [vatNumber, setVatNumber] = useState(vendor.vat_number || '');
  const [vatInclusive, setVatInclusive] = useState<boolean>(vendor.vat_inclusive ?? false);
  const [bankName, setBankName] = useState(vendor.bank_name);
  const [bankAccountHolder, setBankAccountHolder] = useState(vendor.bank_account_holder);
  const [bankAccountNumber, setBankAccountNumber] = useState(vendor.bank_account_number);
  const [bankBranchCode, setBankBranchCode] = useState(vendor.bank_branch_code);
  const [baseDeliveryFee, setBaseDeliveryFee] = useState<number>(vendor.base_delivery_fee ?? 0);
  const [perKmRate, setPerKmRate] = useState<number>(vendor.per_km_rate ?? 22);
  const [freeDeliveryRadiusKm, setFreeDeliveryRadiusKm] = useState<number>(
    vendor.free_delivery_radius_km ?? 15
  );
  const [maxRadiusKm, setMaxRadiusKm] = useState<number>(vendor.max_delivery_radius_km ?? 50);
  const [baseLat, setBaseLat] = useState<number>(vendor.base_location_lat);
  const [baseLon, setBaseLon] = useState<number>(vendor.base_location_lon);
  const [depotAddress, setDepotAddress] = useState<string>(vendor.depot_address || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vendor && isOpen) {
      setBusinessName(vendor.business_name);
      setWhatsappNumber(vendor.whatsapp_number);
      setBusinessType(vendor.business_type || 'retail_delivery');
      setSubscriptionTier(vendor.subscription_tier || 'pro');
      setContactEmail(vendor.contact_email || '');
      setVatNumber(vendor.vat_number || '');
      setVatInclusive(vendor.vat_inclusive ?? false);
      setBankName(vendor.bank_name);
      setBankAccountHolder(vendor.bank_account_holder);
      setBankAccountNumber(vendor.bank_account_number);
      setBankBranchCode(vendor.bank_branch_code);
      setBaseDeliveryFee(vendor.base_delivery_fee ?? 0);
      setPerKmRate(vendor.per_km_rate ?? 22);
      setFreeDeliveryRadiusKm(vendor.free_delivery_radius_km ?? 15);
      setMaxRadiusKm(vendor.max_delivery_radius_km ?? 50);
      setBaseLat(vendor.base_location_lat);
      setBaseLon(vendor.base_location_lon);
      setDepotAddress(vendor.depot_address || '');
    }
  }, [vendor, isOpen]);

  if (!isOpen) return null;

  const tierFees: Record<VendorSubscriptionTier, { monthly: number; comm: number }> = {
    starter: { monthly: 299, comm: 0.08 },
    pro: { monthly: 599, comm: 0.065 },
    enterprise: { monthly: 999, comm: 0.05 },
  };

  const handleSave = async () => {
    setSaving(true);
    const updatedVendor: Vendor = {
      ...vendor,
      business_name: businessName.trim() || vendor.business_name,
      whatsapp_number: whatsappNumber.trim() || vendor.whatsapp_number,
      business_type: businessType,
      contact_email: contactEmail.trim(),
      vat_number: vatNumber.trim(),
      vat_inclusive: vatInclusive,
      bank_account_holder: bankAccountHolder.trim() || businessName.trim(),
      bank_name: bankName,
      bank_account_number: bankAccountNumber.trim(),
      bank_branch_code: bankBranchCode.trim(),
      base_location_lat: Number(baseLat) || -34.1831,
      base_location_lon: Number(baseLon) || 22.1465,
      depot_address: depotAddress,
      max_delivery_radius_km: businessType === 'service_booking' ? 0 : Number(maxRadiusKm) || 50,
      free_delivery_radius_km:
        businessType === 'service_booking' ? 0 : Math.max(0, Number(freeDeliveryRadiusKm) || 0),
      base_delivery_fee:
        businessType === 'service_booking' ? 0 : Math.max(0, Number(baseDeliveryFee) || 0),
      per_km_rate: businessType === 'service_booking' ? 0 : Math.max(0, Number(perKmRate) || 0),
      commission_rate: tierFees[subscriptionTier].comm,
      subscription_tier: subscriptionTier,
      subscription_monthly_fee: tierFees[subscriptionTier].monthly,
    };

    try {
      await fetch(`/api/v1/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedVendor),
      });
    } catch {
      // Fallback to local state if backend is offline
    }

    setSaving(false);
    onVendorUpdated(updatedVendor);
    onClose();
  };

  // Sample 10km vs 25km calculation with Free Local Radius
  const calcDropCost = (km: number) => {
    if (freeDeliveryRadiusKm > 0 && km <= freeDeliveryRadiusKm) return 0;
    const billableKm = freeDeliveryRadiusKm > 0 ? Math.max(0, km - freeDeliveryRadiusKm) : km;
    return Number(baseDeliveryFee) + Number(perKmRate) * billableKm;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-950 border border-emerald-500/40 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl my-8">
        {/* Top Modal Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 block">
                LIVE COMPANY, GPS PIN-DROP DEPOT &amp; DELIVERY PRICING SETTINGS
              </span>
              <h3 className="text-lg font-bold text-white">Edit {vendor.business_name}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Core Business Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                Company / Business Trading Name
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-sm text-white font-semibold focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                Dedicated Cloud WhatsApp Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-emerald-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 pl-10 pr-3.5 py-2.5 text-xs text-emerald-300 font-mono font-bold focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                VAT Registration Number &amp; Catalog VAT Mode
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="VAT Number (optional)"
                  className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white font-mono focus:border-emerald-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setVatInclusive((prev) => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition whitespace-nowrap ${
                    vatInclusive
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  }`}
                >
                  {vatInclusive ? 'Prices INCL. 15% VAT' : 'Prices EXCL. VAT (+15%)'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                Orders &amp; Remittance Email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-xs text-white focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                SaaS Subscription &amp; MoR Commission Tier
              </label>
              <select
                aria-label="Subscription Tier"
                value={subscriptionTier}
                onChange={(e) => setSubscriptionTier(e.target.value as VendorSubscriptionTier)}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-xs text-white font-semibold focus:border-emerald-400 focus:outline-none"
              >
                <option value="starter">Starter — R299/mo (8.0% MoR Comm)</option>
                <option value="pro">Pro Fleet — R599/mo (6.5% MoR Comm)</option>
                <option value="enterprise">Enterprise Depot — R999/mo (5.0% MoR Comm)</option>
              </select>
            </div>
          </div>

          {/* Interactive GPS Pin-Drop Map & PostGIS Delivery Zone */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-sky-500/30 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300">
                <MapPin className="w-4 h-4 text-sky-400" />
                Depot GPS Pin-Drop Map &amp; PostGIS Delivery Zone
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SA_LOCATION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setBaseLat(preset.lat);
                      setBaseLon(preset.lon);
                      setDepotAddress(preset.label);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-950 hover:bg-sky-500/20 text-[10px] font-mono text-sky-300 border border-sky-500/30 transition"
                  >
                    📍 {preset.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Map Pin-Dropper */}
            <GpsPinDropMap
              lat={baseLat}
              lon={baseLon}
              radiusKm={maxRadiusKm}
              freeRadiusKm={freeDeliveryRadiusKm}
              onChange={(newLat, newLon, addr) => {
                setBaseLat(newLat);
                setBaseLon(newLon);
                if (addr) setDepotAddress(addr);
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Depot Latitude (`base_location_lat`)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={baseLat}
                  onChange={(e) => setBaseLat(Number(e.target.value))}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Depot Longitude (`base_location_lon`)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={baseLon}
                  onChange={(e) => setBaseLon(Number(e.target.value))}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Max Delivery Radius (km)
                </label>
                <input
                  type="number"
                  value={maxRadiusKm}
                  onChange={(e) => setMaxRadiusKm(Number(e.target.value))}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-sky-300 font-mono font-bold"
                />
              </div>
            </div>
          </div>

          {/* Delivery / Haulage Pricing Configuration with FREE Local Delivery Zone */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                <Truck className="w-4 h-4 text-emerald-400" />
                Automated WhatsApp Delivery &amp; Tipper Haulage Pricing
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                  Local (≤{freeDeliveryRadiusKm}km): FREE (R0.00)
                </span>
                <span className="text-slate-300">
                  25km Regional Drop: R{calcDropCost(25).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-emerald-300 font-bold mb-1">
                  Free Local Delivery Zone (km)
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={freeDeliveryRadiusKm}
                    onChange={(e) => setFreeDeliveryRadiusKm(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-lg bg-slate-950 border border-emerald-500/50 px-3 py-2 text-sm text-emerald-400 font-mono font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFreeDeliveryRadiusKm(maxRadiusKm);
                      setBaseDeliveryFee(0);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-[10px] font-bold text-emerald-300 border border-emerald-500/40 whitespace-nowrap"
                  >
                    100% Free
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Deliveries within {freeDeliveryRadiusKm}km are R0.00 (Free)
                </span>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Base Flag-Fall Delivery Fee (ZAR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={baseDeliveryFee}
                  onChange={(e) => setBaseDeliveryFee(Math.max(0, Number(e.target.value)))}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-emerald-400 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400 block mt-1">
                  Set to 0 for no base flag-fall fee
                </span>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Per-KM Rate Beyond Free Zone (ZAR / km)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={perKmRate}
                  onChange={(e) => setPerKmRate(Math.max(0, Number(e.target.value)))}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-emerald-400 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400 block mt-1">
                  Charged per km outside the {freeDeliveryRadiusKm}km free zone
                </span>
              </div>
            </div>
          </div>

          {/* SA Bank Settlement Details */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
              <Landmark className="w-4 h-4 text-amber-400" />
              Weekly EFT Batch Settlement Bank Account
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">South African Bank</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Account Holder Name</label>
                <input
                  type="text"
                  value={bankAccountHolder}
                  onChange={(e) => setBankAccountHolder(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Account Number</label>
                <input
                  type="text"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Universal Branch Code</label>
                <input
                  type="text"
                  value={bankBranchCode}
                  onChange={(e) => setBankBranchCode(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-lg transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Syncing...' : 'Save & Sync to Live WhatsApp Engine'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
