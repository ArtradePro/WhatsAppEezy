'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Printer,
  ArrowLeft,
  Truck,
  Calendar,
  ShieldCheck,
  QrCode,
  Sparkles,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

export default function B2BVendorSellSheetPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-200 text-slate-900 p-4 sm:p-8 print:bg-white print:p-0">
      {/* Top Action Bar (Hidden on Print) */}
      <div className="no-print max-w-4xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center text-xs font-bold text-slate-200 hover:text-white bg-slate-800 border border-slate-700 px-3.5 py-2 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Command Center
          </button>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            1-Page A4 B2B Vendor &amp; Contractor Acquisition Sell-Sheet
          </span>
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition"
        >
          <Printer className="w-4 h-4 mr-1.5" />
          Print / Save 1-Page PDF Sell-Sheet
        </button>
      </div>

      {/* Printable 1-Page A4 Collateral Sheet */}
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl border-t-8 border-emerald-600 p-8 sm:p-10 print:shadow-none print:rounded-none print:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4 mb-5">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-[#128C7E] mb-1">
              Official WhatsApp Storefront, AI Photo Studio &amp; Automated PayFast MoR Settlement
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 flex items-center gap-2.5">
              WHATSAPPEEZY.COM
              <span className="text-xs font-bold bg-[#DCF8C6] text-[#075E54] border border-[#25D366] px-2.5 py-0.5 rounded-full">
                Zero-App WhatsApp Commerce
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Turn Any Hygiene Supplier, Restaurant Kitchen, Materials Yard, or Salon Into an Instant WhatsApp Store
            </p>
          </div>

          <div className="text-right text-xs text-slate-700">
            <div className="font-bold text-slate-950 text-sm">Merchant of Record (MoR) Engine</div>
            <div>Capitec Pay • Instant EFT • Card • Scan-to-Pay</div>
            <div className="inline-block mt-1.5 bg-slate-900 text-emerald-400 font-mono text-[10px] font-bold px-2.5 py-0.5 rounded">
              Master WABA: waba_master_cargodash_001
            </div>
          </div>
        </div>

        {/* Hero Pitch Banner */}
        <div className="bg-slate-900 text-white rounded-xl p-5 mb-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-2">
            <h2 className="text-base sm:text-lg font-extrabold text-white mb-1.5">
              Stop Losing Orders to Slow Quotes &amp; Unverified EFT Screenshots.
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              We provision your business its own <strong className="text-emerald-300">dedicated WhatsApp Virtual Number &amp; isolated Meta Product Catalog</strong>.
              Customers browse, drop a GPS site pin (or pick a service appointment slot), and pay instantly via PayFast.
              You receive verified dispatch slips on WhatsApp and automated Friday EFT payouts to your SA bank account.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2.5 text-center">
              <div className="text-base font-black text-emerald-400">60 Sec</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-300">WhatsApp Setup</div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2.5 text-center">
              <div className="text-base font-black text-emerald-400">R0 Data</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-300">Works on WA Bundles</div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2.5 text-center">
              <div className="text-base font-black text-emerald-400">100%</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-300">Verified ITN Split</div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2.5 text-center">
              <div className="text-base font-black text-emerald-400">Friday</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-300">Automated Bank EFT</div>
            </div>
          </div>
        </div>

        {/* Two Verticals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="border border-slate-200 border-t-4 border-t-emerald-600 rounded-xl p-4 bg-white">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded mb-2">
              <Truck className="w-3.5 h-3.5" />
              Vertical A • Builders, Aggregates &amp; Retail Delivery
            </div>
            <h3 className="text-sm font-extrabold text-slate-950 mb-2">
              Building Materials Yards &amp; Tipper Fleets
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-700">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>PostGIS GPS Pin Haulage:</strong> Automatic per-km tipper delivery fee &amp; geofence radius check.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Snap-a-Photo AI Catalog:</strong> WhatsApp a photo of bricks or stone — normalized to a 1024×1024 card for 1-tap publish.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Live Customer ETA &amp; SABS Waybills:</strong> Instant WhatsApp dispatch alerts &amp; printable driver loading slips.</span>
              </li>
            </ul>
          </div>

          <div className="border border-slate-200 border-t-4 border-t-sky-600 rounded-xl p-4 bg-white">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider bg-sky-50 text-sky-700 px-2 py-0.5 rounded mb-2">
              <Calendar className="w-3.5 h-3.5" />
              Vertical B • Salons, Spas &amp; Trade Services
            </div>
            <h3 className="text-sm font-extrabold text-slate-950 mb-2">
              Hair Studios, Wellness Spas &amp; Trade Callouts
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-700">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                <span><strong>Interactive 3-Slot Picker:</strong> Real-time WhatsApp availability list returning your next 3 open slots.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                <span><strong>10-Min Slot Hold + Deposit:</strong> Locks the slot while the client settles their deposit via Capitec Pay / Instant EFT.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                <span><strong>R0.00 Delivery Bypass:</strong> Skips freight calculation and dispatches 1-tap WhatsApp appointment reminders.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Live QR Demo Links */}
        <div className="border-2 border-slate-900 rounded-xl p-4 bg-slate-50 mb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-xs sm:text-sm font-black text-slate-950 flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-emerald-600" />
              SCAN OR CLICK TO TEST THE LIVE MULTI-TENANT WHATSAPP STOREFRONTS NOW
            </h3>
            <span className="text-[11px] font-bold text-emerald-700">
              Isolated Per-Vendor Virtual Numbers &amp; Catalogs
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* QR 1: Materials Yard */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-16 h-16 shrink-0 border border-slate-200 rounded p-1 bg-white flex items-center justify-center">
                <svg viewBox="0 0 29 29" width="56" height="56" shapeRendering="crispEdges">
                  <rect width="29" height="29" fill="#ffffff" />
                  <path
                    fill="#0f172a"
                    d="M0,0h7v7h-7z M1,1v5h5v-5z M2,2h3v3h-3z M22,0h7v7h-7z M23,1v5h5v-5z M24,2h3v3h-3z M0,22h7v7h-7z M1,23v5h5v-5z M2,24h3v3h-3z M8,0h2v1h-2z M11,0h3v2h-3z M16,0h2v1h-2z M19,0h2v2h-2z M8,2h1v3h-1z M10,3h2v2h-2z M14,2h3v1h-3z M18,3h2v2h-2z M8,6h13v1h-13z M0,8h1v2h-1z M2,8h3v1h-3z M6,8h1v13h-1z M8,8h2v2h-2z M12,8h3v2h-3z M17,8h2v3h-2z M21,8h2v2h-2z M25,8h4v1h-4z M0,11h2v3h-2z M3,10h2v2h-2z M9,11h4v2h-4z M14,11h2v4h-2z M18,12h3v2h-3z M22,11h3v2h-3z M26,11h3v2h-3z M1,15h4v2h-4z M8,14h3v3h-3z M12,15h2v2h-2z M17,15h4v2h-4z M23,14h2v3h-2z M26,15h2v3h-2z M0,18h3v2h-3z M4,18h2v3h-2z M9,18h2v3h-2z M13,18h5v2h-5z M20,18h5v5h-5z M21,19v3h3v-3z M22,20h1v1h-1z M8,22h2v3h-2z M11,21h3v2h-3z M15,21h3v3h-3z M26,20h3v2h-3z M8,26h3v3h-3z M12,24h4v2h-4z M17,25h3v4h-3z M21,24h3v3h-3z M25,24h4v2h-4z M26,27h3v2h-3z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-950">1. Materials Yard Demo</div>
                <div className="text-[11px] font-mono font-bold text-emerald-600">+27 60 010 4001</div>
                <p className="text-[10px] text-slate-600 leading-tight my-0.5">
                  BrickDirect catalog, GPS pin &amp; tipper haulage quote.
                </p>
                <a
                  href="https://wa.me/27600104001?text=hi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-900 underline"
                >
                  wa.me/27600104001 <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            {/* QR 2: Salon Booking */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-16 h-16 shrink-0 border border-slate-200 rounded p-1 bg-white flex items-center justify-center">
                <svg viewBox="0 0 29 29" width="56" height="56" shapeRendering="crispEdges">
                  <rect width="29" height="29" fill="#ffffff" />
                  <path
                    fill="#0284c7"
                    d="M0,0h7v7h-7z M1,1v5h5v-5z M2,2h3v3h-3z M22,0h7v7h-7z M23,1v5h5v-5z M24,2h3v3h-3z M0,22h7v7h-7z M1,23v5h5v-5z M2,24h3v3h-3z M9,0h3v2h-3z M14,0h2v2h-2z M18,1h3v2h-3z M8,3h2v2h-2z M12,3h4v2h-4z M17,4h3v2h-3z M6,8h1v13h-1z M8,6h13v1h-13z M0,8h3v2h-3z M4,9h2v2h-2z M9,8h3v3h-3z M14,8h2v2h-2z M18,8h4v2h-4z M24,8h5v2h-5z M1,12h3v2h-3z M8,12h2v3h-2z M11,11h5v2h-5z M17,11h3v3h-3z M22,11h4v2h-4z M27,12h2v3h-2z M0,15h2v3h-2z M3,15h3v2h-3z M10,15h4v2h-4z M15,14h3v3h-3z M19,15h3v2h-3z M24,14h3v3h-3z M2,19h3v2h-3z M8,18h4v3h-4z M13,18h3v2h-3z M20,18h5v5h-5z M21,19v3h3v-3z M22,20h1v1h-1z M26,19h3v3h-3z M8,23h3v2h-3z M12,21h4v3h-4z M17,22h2v4h-2z M9,26h4v3h-4z M14,25h3v3h-3z M20,25h4v3h-4z M25,24h4v5h-4z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-950">2. Salon Booking Demo</div>
                <div className="text-[11px] font-mono font-bold text-sky-600">+27 60 010 4003</div>
                <p className="text-[10px] text-slate-600 leading-tight my-0.5">
                  Aura Luxe 3-slot picker, 10m hold &amp; R0 delivery checkout.
                </p>
                <a
                  href="https://wa.me/27600104003?text=hi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-900 underline"
                >
                  wa.me/27600104003 <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            {/* QR 3: Instant Vendor Self-Onboarding */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-16 h-16 shrink-0 border border-slate-200 rounded p-1 bg-white flex items-center justify-center">
                <svg viewBox="0 0 29 29" width="56" height="56" shapeRendering="crispEdges">
                  <rect width="29" height="29" fill="#ffffff" />
                  <path
                    fill="#059669"
                    d="M0,0h7v7h-7z M1,1v5h5v-5z M2,2h3v3h-3z M22,0h7v7h-7z M23,1v5h5v-5z M24,2h3v3h-3z M0,22h7v7h-7z M1,23v5h5v-5z M2,24h3v3h-3z M8,0h2v2h-2z M12,0h4v1h-4z M18,0h3v2h-3z M9,3h3v2h-3z M14,2h3v3h-3z M19,3h2v2h-2z M8,6h13v1h-13z M6,8h1v13h-1z M0,9h2v3h-2z M3,8h2v3h-2z M8,8h4v2h-4z M13,9h3v2h-3z M17,8h3v3h-3z M22,8h3v2h-3z M26,8h3v3h-3z M1,13h4v2h-4z M9,11h3v3h-3z M13,12h4v2h-4z M19,12h4v2h-4z M24,11h3v3h-3z M0,16h3v3h-3z M4,16h2v2h-2z M8,15h3v3h-3z M12,15h5v2h-5z M18,15h3v2h-3z M23,15h5v2h-5z M2,20h3v1h-3z M9,19h4v2h-4z M15,18h4v3h-4z M20,18h5v5h-5z M21,19v3h3v-3z M22,20h1v1h-1z M26,18h3v4h-3z M8,22h3v3h-3z M12,22h4v2h-4z M17,23h2v3h-2z M8,26h2v3h-2z M11,25h4v4h-4z M16,27h4v2h-4z M21,24h3v4h-3z M25,25h4v4h-4z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-950">3. Self-Onboard Now</div>
                <div className="text-[11px] font-mono font-bold text-emerald-700">Text ONBOARD</div>
                <p className="text-[10px] text-slate-600 leading-tight my-0.5">
                  Auto-provision your virtual number, catalog &amp; bank EFT.
                </p>
                <a
                  href="https://wa.me/27600104001?text=ONBOARD%20My%20Business%20%7C%20retail_delivery%20%7C%20pro%20%7C%20Capitec%201688990011"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 underline"
                >
                  Launch ONBOARD <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Transparent MoR Pricing Table */}
        <div className="mb-4">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-2">
            Transparent Merchant-of-Record (MoR) Tiers — Monthly Fee Auto-Deducted Before Friday EFT Payout
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-wider">
                  <th className="py-2 px-3">Plan Tier</th>
                  <th className="py-2 px-3">Monthly SaaS Fee (Set-Off)</th>
                  <th className="py-2 px-3">Platform Commission</th>
                  <th className="py-2 px-3">PayFast Gateway Rate</th>
                  <th className="py-2 px-3">Best For</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-2 px-3 font-bold">Starter Yard / Studio</td>
                  <td className="py-2 px-3 font-mono">R299 / mo</td>
                  <td className="py-2 px-3 font-mono">7.0%</td>
                  <td className="py-2 px-3 font-mono">3.2% + R2.00</td>
                  <td className="py-2 px-3 text-slate-600">Independent salons, plumbers &amp; hardware stores</td>
                </tr>
                <tr className="bg-emerald-50/80 font-semibold">
                  <td className="py-2 px-3 font-extrabold text-emerald-900">
                    Pro Fleet / Studio (Recommended)
                  </td>
                  <td className="py-2 px-3 font-mono text-emerald-900">R599 / mo</td>
                  <td className="py-2 px-3 font-mono text-emerald-900">5.0%</td>
                  <td className="py-2 px-3 font-mono text-emerald-900">2.9% + R2.00</td>
                  <td className="py-2 px-3 text-emerald-900">Active building supply yards &amp; multi-chair salons</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold">Enterprise Aggregates</td>
                  <td className="py-2 px-3 font-mono">R999 / mo</td>
                  <td className="py-2 px-3 font-mono">3.5%</td>
                  <td className="py-2 px-3 font-mono">2.5% + R1.50</td>
                  <td className="py-2 px-3 text-slate-600">High-volume brick/sand depots (&gt; R150k/mo GMV)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 pt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#128C7E]" />
            <strong>WhatsAppeezy.com Multi-Tenant WhatsApp Commerce &amp; PayFast MoR Engine</strong>
          </div>
          <div className="font-mono text-[10px]">
            Quick Commands: <strong>ADD [Item] | R[Price] | [Unit]</strong> • <strong>HOURS MON-SAT 08:00-17:00 60M</strong> • <strong>BALANCE</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
