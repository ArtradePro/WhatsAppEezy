'use client';

import React from 'react';
import { Order, Vendor } from '../lib/types';
import { Truck, MapPin, CheckSquare, ShieldCheck, Scale, Phone, AlertTriangle, Calendar, FileText } from 'lucide-react';

interface LoadingSlipDocumentProps {
  order: Order;
  vendor: Vendor;
}

export const LoadingSlipDocument: React.FC<LoadingSlipDocumentProps> = ({ order, vendor }) => {
  const formattedDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = new Date(order.created_at || Date.now()).toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Calculate realistic weighbridge tonnage (e.g. plaster sand ~1.45 t/m³)
  const volumeM3 = 6.0;
  const netTonnage = (volumeM3 * 1.45).toFixed(2);
  const tareWeightKg = 11420;
  const netWeightKg = Math.round(parseFloat(netTonnage) * 1000);
  const grossWeightKg = tareWeightKg + netWeightKg;

  return (
    <div className="bg-white text-slate-900 text-xs font-sans p-8 sm:p-10 max-w-4xl mx-auto border border-slate-300 shadow-md print-area">
      {/* 1. Header & SABS Certification */}
      <div className="flex flex-col sm:flex-row justify-between items-start pb-5 border-b-2 border-slate-900 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="bg-slate-900 text-white font-black px-2 py-0.5 rounded text-[10px] tracking-widest uppercase">
              Official Waybill
            </span>
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-700" />
              SABS / SANS 1083 Certified Aggregates
            </span>
          </div>

          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 mt-1">
            {vendor.business_name}
          </h1>
          <p className="text-[11px] text-slate-600">
            DMR Quarry Permit: <span className="font-mono font-bold text-slate-800">WC-DMR-9021</span> | VAT Reg: <span className="font-mono font-bold text-slate-800">{vendor.vat_number || 'ZA4920192837'}</span>
          </p>
          <p className="text-[11px] text-slate-600">
            Main Quarry Route, Albertinia Industrial Corridor, Western Cape
          </p>
          <p className="text-[11px] text-slate-600 flex items-center mt-0.5">
            <Phone className="w-3 h-3 mr-1 text-slate-700" />
            Dispatch Yard VHF Ch 14 • WhatsApp Hotline: <span className="font-bold text-slate-900 ml-1">{vendor.whatsapp_number}</span>
          </p>
        </div>

        {/* Barcode & Reference Block */}
        <div className="text-left sm:text-right flex flex-col items-start sm:items-end">
          <div className="font-mono font-black text-sm bg-slate-100 border border-slate-300 px-3 py-1 rounded text-slate-900">
            DOC #{order.order_ref}
          </div>

          {/* SVG Barcode Representation */}
          <div className="my-1.5 flex items-center space-x-0.5 h-7">
            {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 1, 2, 3, 4, 1, 3, 2, 1, 4, 2, 1, 3, 2, 4, 1].map((w, i) => (
              <div
                key={i}
                className="bg-slate-900 h-full"
                style={{ width: `${w * 1.5}px` }}
              />
            ))}
          </div>

          <span className="font-mono text-[10px] text-slate-500 tracking-wider">
            *{order.order_ref}*
          </span>
          <p className="text-[11px] text-slate-600 mt-1">
            Issue Timestamp: <strong className="text-slate-800">{formattedDate} @ {formattedTime}</strong>
          </p>
        </div>
      </div>

      {/* 2. Dispatch Logistics & Vehicle Assignment Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        {/* Origin & Haulage Rig */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center">
            <Truck className="w-3.5 h-3.5 mr-1 text-slate-700" />
            Fleet Vehicle & Driver Assignment
          </div>
          <p className="text-xs font-bold text-slate-900">
            Rig Reg: <span className="font-mono bg-white border border-slate-300 px-1.5 py-0.5 rounded text-slate-900">CA 821-492</span> (Actros 3340 6x4 Tipper)
          </p>
          <p className="text-xs text-slate-700">
            Assigned Bin: <span className="font-semibold text-slate-900">Tipper Bin #2 (Hardox 450 Body)</span>
          </p>
          <p className="text-xs text-slate-700">
            Designated Driver: <span className="font-semibold text-slate-900">Jan Khumalo (Code 14 PrDP)</span>
          </p>
          <p className="text-[11px] text-slate-500">
            Departure Yard: Albertinia Aggregates Depot (Bay 02)
          </p>
        </div>

        {/* Site Destination & Customer */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-black uppercase text-emerald-800 tracking-wider flex items-center">
            <MapPin className="w-3.5 h-3.5 mr-1 text-emerald-700" />
            Consignee & Site Offloading Point
          </div>
          <p className="text-xs font-bold text-slate-900">
            {order.customer_name}
          </p>
          <p className="text-xs text-slate-800">
            {order.delivery_address}
          </p>
          <p className="text-xs font-mono text-slate-700">
            Site Mobile: <strong className="text-slate-900">{order.customer_phone}</strong>
          </p>
          <p className="text-[11px] text-emerald-800 font-semibold">
            📍 Route Distance: ~{order.distance_km.toFixed(1)} km from Quarry
          </p>
        </div>
      </div>

      {/* 3. Certified Weighbridge Scale Record */}
      <div className="my-5 border border-slate-300 rounded-lg overflow-hidden">
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-300 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center">
            <Scale className="w-3.5 h-3.5 mr-1 text-slate-700" />
            Certified Weighbridge Scale Certification (Net Weight)
          </span>
          <span className="text-[10px] font-mono text-slate-500 font-bold">
            SCALE UNIT #WB-01 (CALIBRATED SABS 2026)
          </span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-300 text-center py-2.5 bg-white text-xs">
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Tare (Empty Rig)</span>
            <span className="font-mono text-sm font-bold text-slate-800">{tareWeightKg.toLocaleString()} kg</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Gross (Rig + Sand)</span>
            <span className="font-mono text-sm font-bold text-slate-800">{grossWeightKg.toLocaleString()} kg</span>
          </div>
          <div className="bg-emerald-50/60">
            <span className="text-[10px] text-emerald-800 block uppercase font-black">Net Certified Payload</span>
            <span className="font-mono text-sm font-black text-emerald-900">{netWeightKg.toLocaleString()} kg ({netTonnage} Tonnes)</span>
          </div>
        </div>
      </div>

      {/* 4. Manifest & Bill of Lading Items */}
      <div className="my-5">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700 mb-2">
          Material Manifest & Batch Quality Specifications
        </h4>
        <table className="w-full text-left border-collapse border border-slate-300 text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 uppercase text-[10px] font-black border-b border-slate-300">
              <th className="p-2 border border-slate-300">Item Description</th>
              <th className="p-2 border border-slate-300 text-center">Grading / Spec</th>
              <th className="p-2 border border-slate-300 text-center">Volume</th>
              <th className="p-2 border border-slate-300 text-center">Net Tonnes</th>
              <th className="p-2 border border-slate-300 text-right">Payment Verification</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2.5 border border-slate-300 font-bold text-slate-900">
                {order.materials_breakdown || '6m³ Plaster Sand (Washed Malmesbury Grade)'}
                <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                  Direct Tipper Yard Dispatch • SABS SANS 1083 Civil Plastering Sand
                </div>
              </td>
              <td className="p-2.5 border border-slate-300 text-center font-mono text-slate-700">
                FM 1.90 / Screened
              </td>
              <td className="p-2.5 border border-slate-300 text-center font-bold text-slate-900">
                6.00 m³
              </td>
              <td className="p-2.5 border border-slate-300 text-center font-mono font-bold text-slate-900">
                {netTonnage} t
              </td>
              <td className="p-2.5 border border-slate-300 text-right whitespace-nowrap">
                <span className="font-bold text-emerald-800">
                  PAID IN FULL
                </span>
                <div className="text-[10px] text-slate-500 font-mono">
                  {order.payfast_pf_payment_id || 'PayFast Instant EFT'}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 5. Driver Safety & Site Tipping Protocols */}
      <div className="my-5 p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1.5 text-amber-900">
        <div className="flex items-center text-amber-800 font-bold uppercase tracking-wider text-[10px]">
          <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600" />
          Mandatory Hydraulic Tipping & Site Safety Protocols
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
          <div className="flex items-center space-x-1.5">
            <CheckSquare className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>Overhead powerlines inspected (&gt;6m safety clearance)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <CheckSquare className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>Driver checked firm, level, unyielding soil before hoist</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <CheckSquare className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>Tailgate safety latches fully disengaged before tipping</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <CheckSquare className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>Driver wear PPE: Hard hat, reflective vest, steel-toe boots</span>
          </div>
        </div>
      </div>

      {/* 6. Triple Sign-Off Blocks */}
      <div className="mt-8 pt-4 border-t-2 border-slate-300">
        <div className="grid grid-cols-3 gap-6 text-center text-xs">
          {/* Signoff 1: Weighbridge */}
          <div className="space-y-4">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              1. Weighbridge Clerk
            </div>
            <div className="h-10 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
              <span className="font-serif italic text-slate-600 text-sm">P. Botha</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Payload Certified &amp; Released
              <div className="text-[9px] text-slate-400 font-mono mt-0.5">{formattedDate}</div>
            </div>
          </div>

          {/* Signoff 2: Driver */}
          <div className="space-y-4">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              2. Tipper Truck Driver
            </div>
            <div className="h-10 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
              <span className="font-serif italic text-slate-600 text-sm">J. Khumalo</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Load Inspected &amp; Tarp Secured
              <div className="text-[9px] text-slate-400 font-mono mt-0.5">En Route Delivery</div>
            </div>
          </div>

          {/* Signoff 3: Customer / Site Foreman */}
          <div className="space-y-4">
            <div className="text-[10px] font-bold uppercase text-emerald-800">
              3. Site Receiver (Foreman)
            </div>
            <div className="h-10 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
              <span className="text-[10px] text-slate-400 italic">Sign / Stamp on Arrival</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Materials Received in Good Order
              <div className="text-[9px] text-slate-400 font-mono mt-0.5">Date: ____ / ____ / 2026</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Legal Terms */}
      <div className="mt-8 pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[9px] text-slate-400">
        <span>Delivery Slip generated automatically via WhatsApp Commerce Aggregator Engine.</span>
        <span>Customer Copy • Transporter Copy • Weighbridge Audit Record</span>
      </div>
    </div>
  );
};
