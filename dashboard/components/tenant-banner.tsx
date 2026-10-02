'use client';

import React from 'react';
import { Vendor } from '../lib/types';
import { Warehouse, MessageSquare, CalendarCheck, ShieldCheck, ChevronDown } from 'lucide-react';

interface TenantBannerProps {
  currentVendor: Vendor;
  allVendors: Vendor[];
  onSelectVendor: (vendor: Vendor) => void;
  payoutDate: string;
  isWhatsAppConnected?: boolean;
}

export const TenantBanner: React.FC<TenantBannerProps> = ({
  currentVendor,
  allVendors,
  onSelectVendor,
  payoutDate,
  isWhatsAppConnected = true,
}) => {
  return (
    <header className="bg-industrial-900 border-b border-industrial-800 text-slate-100 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Yard Info & Multi-Tenant Switcher */}
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Warehouse className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-industrial-400">
                  Active Dispatch Yard
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                  <ShieldCheck className="w-3 h-3 mr-1 text-emerald-400" />
                  Verified Merchant
                </span>
              </div>
              <div className="relative inline-block mt-0.5">
                <select
                  value={currentVendor.id}
                  onChange={(e) => {
                    const found = allVendors.find((v) => v.id === e.target.value);
                    if (found) onSelectVendor(found);
                  }}
                  className="bg-industrial-850 hover:bg-industrial-800 text-slate-100 font-bold text-base sm:text-lg rounded-md pl-2 pr-8 py-1 border border-industrial-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer appearance-none"
                >
                  {allVendors.map((v) => (
                    <option key={v.id} value={v.id} className="bg-industrial-900 text-slate-100">
                      {v.business_name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-industrial-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Status Indicators & Settlement Info */}
          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
            {/* WhatsApp API Connection Status */}
            <div className="flex items-center px-3 py-1.5 rounded-md bg-industrial-850 border border-industrial-700/80 text-industrial-200">
              <span className="relative flex h-2.5 w-2.5 mr-2">
                {isWhatsAppConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    isWhatsAppConnected ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                ></span>
              </span>
              <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-industrial-400" />
              <span>
                WhatsApp API: <strong className="text-emerald-400 font-semibold">Live Cloud v19.0</strong>
              </span>
            </div>

            {/* Next Settlement Payout */}
            <div className="flex items-center px-3 py-1.5 rounded-md bg-industrial-850 border border-industrial-700/80 text-industrial-200">
              <CalendarCheck className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              <span>
                Next Payout: <strong className="text-slate-100 font-medium">{payoutDate}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
