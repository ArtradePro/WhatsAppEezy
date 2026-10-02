'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MOCK_ORDERS_LIST, MOCK_DEFAULT_VENDOR } from '../../../lib/mock-data';
import { Printer, ArrowLeft } from 'lucide-react';
import { LoadingSlipDocument } from '../../../components/loading-slip-document';

export default function WaybillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderRef = params?.orderRef as string;

  const order = MOCK_ORDERS_LIST.find(
    (o) => o.order_ref.toLowerCase() === orderRef?.toLowerCase()
  ) || MOCK_ORDERS_LIST[0];

  const vendor = MOCK_DEFAULT_VENDOR;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 sm:p-8">
      {/* Top Bar (Hidden on Print) */}
      <div className="no-print max-w-4xl mx-auto mb-6 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 px-3.5 py-2 rounded-lg shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Dispatch Yard
        </button>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white shadow"
        >
          <Printer className="w-4 h-4 mr-1.5" />
          Print / Export PDF Delivery Note
        </button>
      </div>

      {/* Official SABS Compliant Delivery Note Document */}
      <LoadingSlipDocument order={order} vendor={vendor} />
    </div>
  );
}
