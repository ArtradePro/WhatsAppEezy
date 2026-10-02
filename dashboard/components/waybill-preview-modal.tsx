'use client';

import React from 'react';
import { Order, Vendor } from '../lib/types';
import { X, Printer, FileText } from 'lucide-react';
import { LoadingSlipDocument } from './loading-slip-document';

interface WaybillPreviewModalProps {
  order: Order | null;
  vendor: Vendor;
  isOpen: boolean;
  onClose: () => void;
}

export const WaybillPreviewModal: React.FC<WaybillPreviewModalProps> = ({
  order,
  vendor,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden print-area">
        {/* Modal Top Actions (Hidden on Print) */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-slate-100">
              Driver Loading Slip &amp; Delivery Note — #{order.order_ref}
            </h3>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-colors"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Document */}
        <div className="overflow-y-auto max-h-[80vh] p-4 sm:p-6 bg-slate-200">
          <LoadingSlipDocument order={order} vendor={vendor} />
        </div>

        {/* Modal Footer (Hidden on Print) */}
        <div className="no-print px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
