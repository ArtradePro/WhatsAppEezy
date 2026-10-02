'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MOCK_VENDORS_LIST } from '../../lib/mock-data';
import { Warehouse, Lock, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [selectedVendorId, setSelectedVendorId] = useState(MOCK_VENDORS_LIST[0].id);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-industrial-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3">
          <Warehouse className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-100">
          Vendor Admin Portal
        </h2>
        <p className="mt-1 text-xs text-industrial-400">
          WhatsApp Commerce Aggregator • Yard Dispatch & Stock Console
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-industrial-900 border border-industrial-800 py-8 px-6 sm:px-10 rounded-2xl shadow-xl space-y-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-industrial-300 mb-1.5">
                Select Dispatch Yard (Tenant)
              </label>
              <select
                value={selectedVendorId}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                className="w-full bg-industrial-850 border border-industrial-700 text-slate-100 text-sm rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                {MOCK_VENDORS_LIST.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.business_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-industrial-300 mb-1.5">
                Authorized Mobile / WhatsApp PIN
              </label>
              <div className="relative">
                <input
                  type="password"
                  defaultValue="123456"
                  className="w-full bg-industrial-850 border border-industrial-700 text-slate-100 text-sm rounded-lg pl-3.5 pr-10 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <Lock className="w-4 h-4 text-industrial-500 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all"
            >
              Sign In to Yard Console
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </form>

          <div className="pt-4 border-t border-industrial-800 text-center">
            <div className="inline-flex items-center text-[11px] text-industrial-400">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              Multi-Tenant Session Scoped to Vendor ID
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
