'use client';

import React from 'react';
import { DashboardMetrics } from '../lib/types';
import { TrendingUp, Wallet, Truck, Percent, ArrowUpRight } from 'lucide-react';

interface MetricsStripProps {
  metrics: DashboardMetrics;
}

export const MetricsStrip: React.FC<MetricsStripProps> = ({ metrics }) => {
  const formatZAR = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const cards = [
    {
      id: 'gmv',
      title: 'Current Month GMV',
      value: formatZAR(metrics.gmvMonth),
      subtext: '+18.4% vs last calendar month',
      subtextColor: 'text-emerald-400',
      icon: TrendingUp,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20',
      badge: 'Aggregated Gross',
    },
    {
      id: 'payout',
      title: 'Net Payable Balance',
      value: formatZAR(metrics.netPayableBalance),
      subtext: 'Ready for weekly ACB / EFT release',
      subtextColor: 'text-industrial-300',
      icon: Wallet,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/20',
      badge: 'Escrow Verified',
    },
    {
      id: 'active_orders',
      title: 'Active Dispatch Queue',
      value: `${metrics.activeOrdersCount} Loads`,
      subtext: 'Paid & in-transit site deliveries',
      subtextColor: 'text-truck-sky',
      icon: Truck,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10 border-blue-500/20',
      badge: 'Real-Time',
    },
    {
      id: 'conversion',
      title: 'WhatsApp Conversion Rate',
      value: `${metrics.conversionRatePct.toFixed(1)}%`,
      subtext: 'Interactive Quote to PayFast Settlement',
      subtextColor: 'text-emerald-400',
      icon: Percent,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20',
      badge: 'Conversational',
    },
  ];

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            className="bg-industrial-900 border border-industrial-800 rounded-xl p-4 sm:p-5 shadow-sm hover:border-industrial-700 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-industrial-400 uppercase tracking-wider">
                {card.title}
              </span>
              <span className="text-[10px] px-2 py-0.5 font-medium rounded-full bg-industrial-800 text-industrial-300 border border-industrial-700/60">
                {card.badge}
              </span>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
                {card.value}
              </div>
              <div className={`p-2 rounded-lg border ${card.iconBg} ${card.iconColor}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>

            <div className="mt-2.5 flex items-center text-xs text-industrial-400">
              <ArrowUpRight className="w-3.5 h-3.5 mr-1 text-emerald-400 shrink-0" />
              <span className={`font-medium ${card.subtextColor}`}>{card.subtext}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
};
