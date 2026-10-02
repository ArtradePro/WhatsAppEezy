'use client';

import React, { useState } from 'react';
import { Order, OrderStatus } from '../lib/types';
import {
  Truck,
  CheckCircle,
  FileText,
  Clock,
  MapPin,
  Phone,
  Search,
  Check,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

interface DispatchQueueProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, nextStatus: OrderStatus) => Promise<void>;
  onOpenWaybill: (order: Order) => void;
  isLoading?: boolean;
}

export const DispatchQueue: React.FC<DispatchQueueProps> = ({
  orders,
  onUpdateStatus,
  onOpenWaybill,
  isLoading = false,
}) => {
  const [filter, setFilter] = useState<'all' | 'paid' | 'dispatched' | 'delivered'>('all');
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const formatZAR = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const filteredOrders = orders.filter((order) => {
    const matchesFilter = filter === 'all' || order.current_status === filter;
    const matchesSearch =
      order.order_ref.toLowerCase().includes(search.toLowerCase()) ||
      order.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      order.delivery_address.toLowerCase().includes(search.toLowerCase()) ||
      (order.materials_breakdown && order.materials_breakdown.toLowerCase().includes(search.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    try {
      setProcessingId(orderId);
      await onUpdateStatus(orderId, nextStatus);
    } finally {
      setProcessingId(null);
    }
  };

  const renderStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3 mr-1 text-amber-400" />
            Paid (Needs Loading)
          </span>
        );
      case 'dispatched':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Truck className="w-3 h-3 mr-1 text-blue-400" />
            Truck Dispatched
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle className="w-3 h-3 mr-1 text-emerald-400" />
            Delivered to Site
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-industrial-800 text-industrial-300 border border-industrial-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="bg-industrial-900 border border-industrial-800 rounded-xl overflow-hidden shadow-sm">
      {/* Table Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-industrial-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Truck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">Live Yard Dispatch Queue</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-industrial-800 text-industrial-300 border border-industrial-700">
              {filteredOrders.length} orders
            </span>
          </div>
          <p className="text-xs text-industrial-400 mt-1">
            Real-time status updates broadcast direct GPS & dispatch tracking notifications to customer WhatsApp lines.
          </p>
        </div>

        {/* Filter Tabs & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-industrial-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search ref, customer, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 bg-industrial-850 border border-industrial-700 text-slate-100 text-xs rounded-lg pl-9 pr-3 py-2 placeholder-industrial-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center bg-industrial-850 p-1 rounded-lg border border-industrial-700">
            {(['all', 'paid', 'dispatched', 'delivered'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-all ${
                  filter === tab
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-industrial-400 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Responsive Table / Cards */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-industrial-800 bg-industrial-850 text-industrial-400 uppercase tracking-wider text-[11px] font-bold">
              <th className="py-3 px-4">Order Ref</th>
              <th className="py-3 px-4">Customer Details</th>
              <th className="py-3 px-4">Delivery Site Address</th>
              <th className="py-3 px-4">Materials Breakdown</th>
              <th className="py-3 px-4 text-right">Total Paid (Gross)</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">One-Click Dispatch Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-industrial-800">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-industrial-400">
                  <AlertCircle className="w-8 h-8 mx-auto text-industrial-500 mb-2" />
                  <p className="font-semibold text-slate-300">No dispatch orders found</p>
                  <p className="text-xs text-industrial-500 mt-0.5">
                    No orders match your filter criteria.
                  </p>
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => {
                const isUpdating = processingId === order.id;

                return (
                  <tr
                    key={order.id}
                    className="hover:bg-industrial-850/60 transition-colors group"
                  >
                    {/* Order Ref */}
                    <td className="py-4 px-4 font-mono font-bold text-slate-100 whitespace-nowrap">
                      <span className="text-emerald-400">#</span>
                      {order.order_ref}
                      <span className="block text-[10px] font-normal text-industrial-400">
                        {new Date(order.created_at).toLocaleTimeString('en-ZA', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="font-bold text-slate-200">{order.customer_name}</div>
                      <a
                        href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-xs text-emerald-400 hover:text-emerald-300 mt-0.5"
                      >
                        <Phone className="w-3 h-3 mr-1" />
                        {order.customer_phone}
                      </a>
                    </td>

                    {/* Address & Distance */}
                    <td className="py-4 px-4 max-w-xs">
                      <div className="flex items-start text-xs text-slate-300">
                        <MapPin className="w-3.5 h-3.5 mr-1 text-industrial-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{order.delivery_address}</span>
                      </div>
                      <span className="inline-block mt-1 text-[11px] font-medium text-industrial-400">
                        📍 ~{order.distance_km.toFixed(1)} km haulage distance
                      </span>
                    </td>

                    {/* Materials Breakdown */}
                    <td className="py-4 px-4 max-w-xs">
                      <div className="font-medium text-slate-200 line-clamp-2">
                        {order.materials_breakdown || 'Building Materials & Bulk Aggregates'}
                      </div>
                      <span className="text-[11px] text-industrial-400">
                        Net Payout: {formatZAR(order.vendor_payout)}
                      </span>
                    </td>

                    {/* Total Paid */}
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <div className="font-bold text-slate-100">{formatZAR(order.total_amount)}</div>
                      <span className="text-[10px] font-medium text-emerald-400">PayFast Verified</span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      {renderStatusBadge(order.current_status)}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-2">
                        {/* Download Waybill */}
                        <button
                          onClick={() => onOpenWaybill(order)}
                          title="Print Waybill / Loading Slip"
                          className="p-1.5 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-industrial-300 hover:text-slate-100 border border-industrial-700 transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                        </button>

                        {/* Transition: Mark Dispatched */}
                        {order.current_status === 'paid' && (
                          <button
                            disabled={isUpdating}
                            onClick={() => handleStatusChange(order.id, 'dispatched')}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow transition-all disabled:opacity-50"
                          >
                            <Truck className="w-3.5 h-3.5 mr-1" />
                            {isUpdating ? 'Dispatching...' : 'Mark Dispatched'}
                          </button>
                        )}

                        {/* Transition: Mark Delivered */}
                        {order.current_status === 'dispatched' && (
                          <button
                            disabled={isUpdating}
                            onClick={() => handleStatusChange(order.id, 'delivered')}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {isUpdating ? 'Completing...' : 'Mark Delivered'}
                          </button>
                        )}

                        {/* Already Delivered */}
                        {order.current_status === 'delivered' && (
                          <span className="text-[11px] font-semibold text-emerald-400 flex items-center pr-2">
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />
                            Completed
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
