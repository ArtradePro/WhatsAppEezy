'use client';

import React, { useState } from 'react';
import {
  MessageCircle,
  Sparkles,
  ShieldCheck,
  Truck,
  Flame,
  Calendar,
  Camera,
  CheckCircle2,
  ArrowRight,
  Smartphone,
  MapPin,
  CreditCard,
  CheckCheck,
  Send,
  Zap,
  Layers,
  Copy,
  Check,
  Building2,
  Printer,
  Globe,
} from 'lucide-react';

const VERTICAL_SHOWCASES = [
  {
    id: 'hygiene',
    badge: '🧴 Hygiene & Commercial Supplies',
    businessName: 'Higiene Commercial Hygiene (Pty) Ltd',
    whatsapp: '+27 60 010 4005',
    productTitle: 'Higiene 5L SABS Industrial Surface Sanitizer',
    unitPrice: 420,
    unitLabel: 'per 5L drum',
    qty: 4,
    deliveryFee: 85,
    pinText: 'Pin: Unit 8, Montague Gardens Industrial (6.2 km)',
    ticketType: 'Commercial Dispatch & Batch Certificate Slip',
    imageUrl:
      'https://images.unsplash.com/photo-1584813470613-5b1c1cad3d69?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'restaurant',
    badge: '🍔 Restaurants & Takeaway Kitchens',
    businessName: 'Napoli Woodfired Pizza & Burger Kitchen',
    whatsapp: '+27 60 010 4004',
    productTitle: 'Double Wagyu Smash Burger & Rosemary Fries',
    unitPrice: 165,
    unitLabel: 'per combo meal',
    qty: 2,
    deliveryFee: 45,
    pinText: 'Pin: Unit 14B, Rosebank Precinct (3.4 km)',
    ticketType: 'Hot-Pass Kitchen Order Ticket (KOT) + Tamper Seal',
    imageUrl:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'materials',
    badge: '🧱 Building Materials & Tipper Yards',
    businessName: 'BrickDirect Aggregates & Sand Yard',
    whatsapp: '+27 60 010 4001',
    productTitle: 'Washed Malmesbury Plaster Sand (6m³ Load)',
    unitPrice: 550,
    unitLabel: 'per m³',
    qty: 6,
    deliveryFee: 562.4,
    pinText: 'Pin: Stand 402, Albertinia Civil Site (14.2 km)',
    ticketType: 'SABS Weighbridge & Tipper Truck Loading Slip',
    imageUrl:
      'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'salon',
    badge: '💇‍♀️ Salons, Spas & Trade Bookings',
    businessName: 'Aura Luxe Hair & Wellness Studio',
    whatsapp: '+27 60 010 4003',
    productTitle: 'Signature Balayage, Toner & Precision Cut',
    unitPrice: 650,
    unitLabel: '60 min session',
    qty: 1,
    deliveryFee: 0,
    pinText: 'Slot Held: Tomorrow 09:00–10:00 AM (10-Min Lock)',
    ticketType: 'Confirmed Stylist Calendar Booking + 1h WhatsApp Reminder',
    imageUrl:
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=80',
  },
];

const GEMINI_ANTIGRAVITY_PROMPTS = [
  {
    title: '1. On-The-Spot AI Photo & Catalog Spec Extractor Prompt',
    tag: 'GEMINI FLASH VISION // 1024×1024 STUDIO',
    prompt:
      'Analyze this raw merchant product photo and caption. Normalize the item onto a clean 1024x1024 #F8F9FA studio canvas, extract the commercial title, category, ZAR unit price, unit of measure (per 5L drum / per combo / per m3 / per session), and generate a high-converting WhatsApp Catalog description.',
  },
  {
    title: '2. Zero-App WhatsApp Conversational Checkout State Machine Prompt',
    tag: 'WHATSAPPEEZY CONVERSATIONAL ENGINE',
    prompt:
      'Guide the customer from WhatsApp catalog selection to GPS location pin drop (or 10-minute appointment slot hold), calculate exact PostGIS road distance delivery fee, and issue an instant 100% Verified PayFast MoR payment link.',
  },
  {
    title: '3. Multi-Vertical Dispatch Ticket & MoR Sub-Ledger Prompt',
    tag: 'PAYFAST MoR // KITCHEN KOT & YARD WAYBILL',
    prompt:
      'Upon verified PayFast ITN webhook, atomically split gross ZAR into 4 ledger entries (Customer Payment, Platform Commission, Gateway Spread, Net Vendor Payout), deduct monthly SaaS fee set-off if due, and fire either a Kitchen Order Ticket (KOT) or SABS Weighbridge Tipper Slip.',
  },
];

export default function WhatsAppeezyOfficialWebsite() {
  const [activeVerticalIdx, setActiveVerticalIdx] = useState(0);
  const [monthlyGmv, setMonthlyGmv] = useState(120000);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadSubmitted, setLeadSubmitted] = useState(false);

  const activeVertical = VERTICAL_SHOWCASES[activeVerticalIdx];
  const subtotal = activeVertical.unitPrice * activeVertical.qty;
  const totalAmount = subtotal + activeVertical.deliveryFee;

  const handleCopyPrompt = (text: string, idx: number) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
    }
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#0B141A] text-slate-100 flex flex-col selection:bg-[#25D366]/30 selection:text-[#25D366]">
      {/* 1. Top WhatsApp Deep Teal Official Announcement Bar */}
      <div className="wa-teal-header border-b border-[#25D366]/30 text-xs font-mono">
        <div className="max-w-7xl mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#25D366] animate-ping" />
            <span>WHATSAPPEEZY.COM // OFFICIAL SOUTH AFRICAN WHATSAPP COMMERCE &amp; PAYFAST MoR PORTAL</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-[#DCF8C6] hover:text-white font-bold underline flex items-center gap-1"
            >
              ⚡ Go to Live Merchant Command Portal →
            </a>
          </div>
        </div>
      </div>

      {/* 2. Sticky Navigation Header in Authentic WhatsApp Dark (#111B21) */}
      <header className="sticky top-0 z-40 bg-[#111B21]/95 backdrop-blur-xl border-b border-[#25D366]/20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <a href="/website" className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center shadow-lg glow-emerald">
              <MessageCircle className="w-6 h-6 text-[#06130E] fill-[#06130E]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-white font-display">
                  WhatsApp<span className="text-[#25D366]">eezy</span>
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#005C4B] text-[#DCF8C6] border border-[#25D366]/40">
                  .COM
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                AI Catalog Studio • PayFast MoR • Instant Dispatch
              </p>
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-xs font-bold uppercase tracking-wider text-slate-300">
            <a href="#how-it-works" className="hover:text-[#25D366] transition">
              How It Works
            </a>
            <a href="#ai-studio" className="hover:text-[#25D366] transition">
              AI Photo Studio
            </a>
            <a href="#verticals" className="hover:text-[#25D366] transition">
              Industries
            </a>
            <a href="#pricing" className="hover:text-[#25D366] transition">
              Pricing &amp; Payouts
            </a>
            <a href="#gemini-prompts" className="hover:text-[#25D366] transition">
              Gemini AI Prompts
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <a
              href="/sell-sheet"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1F2C34] hover:bg-[#2a3b46] text-[#DCF8C6] border border-[#25D366]/30 text-xs font-bold transition"
            >
              <Printer className="w-3.5 h-3.5 text-[#25D366]" />
              Print B2B Sell-Sheet
            </a>
            <a
              href="/"
              className="wa-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition"
            >
              <Zap className="w-4 h-4" />
              Open Live Merchant Portal
            </a>
          </div>
        </div>
      </header>

      {/* 3. Hero Section with Official WhatsApp Colors & Interactive Phone Simulator */}
      <section className="relative overflow-hidden py-14 sm:py-20 bg-telemetry-canvas border-b border-[#25D366]/15">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left 7 Cols: Value Proposition */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#005C4B]/80 border border-[#25D366]/40 text-[#DCF8C6] text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5 text-[#25D366]" />
              Powered by Gemini Flash Vision + Official Meta WhatsApp Cloud API
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight font-display leading-[1.08]">
              Turn Any WhatsApp Into an{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#25D366] via-[#4AE382] to-[#128C7E]">
                AI Store, PayFast Checkout &amp; Dispatch Engine.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
              No apps to download. No complex websites to maintain. With{' '}
              <strong className="text-white">WhatsAppeezy.com</strong>, we load your catalog on the
              spot with <strong className="text-[#25D366]">AI-enhanced 1024×1024 photos</strong>,
              collect 100% verified <strong className="text-[#25D366]">PayFast &amp; Capitec Pay</strong>{' '}
              payments into our Master Merchant Account, and fire instant{' '}
              <strong className="text-white">
                Kitchen Order Tickets, Hygiene Dispatch Slips, or Tipper Waybills
              </strong>
              .
            </p>

            {/* Interactive Industry Selector Pills */}
            <div id="verticals" className="space-y-2 pt-1">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#25D366] font-bold">
                👇 Click an industry below to test the live WhatsApp experience on the phone:
              </div>
              <div className="flex flex-wrap gap-2">
                {VERTICAL_SHOWCASES.map((vert, idx) => (
                  <button
                    key={vert.id}
                    onClick={() => setActiveVerticalIdx(idx)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition border ${
                      activeVerticalIdx === idx
                        ? 'bg-[#25D366] text-[#06130E] border-[#25D366] shadow-lg glow-emerald'
                        : 'bg-[#111B21] text-slate-300 border-[#1F2C34] hover:border-[#25D366]/50'
                    }`}
                  >
                    {vert.badge}
                  </button>
                ))}
              </div>
            </div>

            {/* Hero CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <a
                href="/"
                className="wa-gradient-btn px-6 py-3.5 rounded-2xl text-sm font-extrabold flex items-center gap-2 transition"
              >
                <span>Launch Live Command Center &amp; Onboard a Client</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#onboard-now"
                className="px-5 py-3.5 rounded-2xl bg-[#1F2C34] hover:bg-[#283842] text-white border border-[#25D366]/30 text-sm font-bold transition"
              >
                Register Your Business on WhatsAppeezy
              </a>
            </div>

            {/* Trust Metrics */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#1F2C34]">
              <div>
                <div className="text-2xl font-extrabold text-[#25D366] font-display">100%</div>
                <div className="text-xs text-slate-400">Verified PayFast ITN Split (Zero Pop Fraud)</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-white font-display">1024×1024</div>
                <div className="text-xs text-slate-400">Instant Gemini AI Photo Studio Enhancement</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-[#DCF8C6] font-display">&lt; 3 Sec</div>
                <div className="text-xs text-slate-400">From Payment to Kitchen KOT or Yard Slip</div>
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Authentic WhatsApp Handset Live Simulator */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="w-full max-w-[380px] rounded-[38px] p-3 bg-gradient-to-b from-[#1F2C34] via-[#111B21] to-[#075E54] shadow-[0_30px_80px_-15px_rgba(37,211,102,0.38)] border-2 border-[#25D366]/40">
              <div className="rounded-[28px] overflow-hidden bg-[#0B141A] border border-black/40 flex flex-col">
                {/* Official WhatsApp Teal Top Header (#075E54) */}
                <div className="bg-[#075E54] px-4 py-3.5 flex items-center justify-between border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-[#25D366] text-[#06130E] font-black text-xs flex items-center justify-center shadow">
                      {activeVertical.businessName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1">
                        <span className="truncate max-w-[180px]">{activeVertical.businessName}</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-[#25D366] shrink-0" />
                      </div>
                      <div className="text-[10px] text-[#DCF8C6] font-mono">
                        WhatsAppeezy Verified • {activeVertical.whatsapp}
                      </div>
                    </div>
                  </div>
                  <Smartphone className="w-4 h-4 text-[#DCF8C6]" />
                </div>

                {/* WhatsApp Chat Stream */}
                <div className="whatsapp-dark-wallpaper p-4 space-y-3 text-xs">
                  {/* AI Studio Catalog Card Bubble */}
                  <div className="bg-[#1F2C34] rounded-xl p-2.5 border border-white/10 shadow-md max-w-[94%]">
                    <div className="flex gap-3 items-center">
                      <img
                        src={activeVertical.imageUrl}
                        alt={activeVertical.productTitle}
                        className="w-16 h-16 rounded-lg object-cover bg-white border border-[#25D366]/40 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#005C4B] text-[#DCF8C6]">
                          ✨ 1024×1024 AI ENHANCED
                        </span>
                        <div className="font-bold text-white truncate mt-1 text-xs">
                          {activeVertical.productTitle}
                        </div>
                        <div className="text-[#25D366] font-mono font-bold text-xs mt-0.5">
                          R {activeVertical.unitPrice.toFixed(2)}{' '}
                          <span className="text-slate-400 font-normal">
                            {activeVertical.unitLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Outgoing Customer Order Bubble (#005C4B) */}
                  <div className="ml-auto bg-[#005C4B] text-white rounded-xl rounded-tr-none px-3.5 py-2.5 max-w-[88%] shadow">
                    <div className="font-bold text-xs">
                      🛒 Order: {activeVertical.qty} × {activeVertical.productTitle}
                    </div>
                    <div className="text-[11px] text-[#DCF8C6] flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-[#25D366]" />
                      <span>{activeVertical.pinText}</span>
                    </div>
                    <div className="text-[9px] text-emerald-200/80 text-right flex items-center justify-end gap-1 mt-1">
                      <span>14:32</span>
                      <CheckCheck className="w-3.5 h-3.5 text-[#34B7F1]" />
                    </div>
                  </div>

                  {/* Incoming WhatsAppeezy PayFast MoR Bubble */}
                  <div className="bg-[#1F2C34] text-slate-100 rounded-xl rounded-tl-none p-3.5 max-w-[94%] border border-[#25D366]/40 shadow-lg space-y-2.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#25D366] font-bold">
                      <span>⚡ WHATSAPPEEZY PAYFAST MoR</span>
                      <span>100% VERIFIED ITN</span>
                    </div>

                    <div className="text-[11px] space-y-1 text-slate-300 font-mono">
                      <div className="flex justify-between">
                        <span>Items ({activeVertical.qty}x):</span>
                        <span>R {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GPS Delivery / Slot Fee:</span>
                        <span>R {activeVertical.deliveryFee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-white border-t border-white/10 pt-1 text-xs">
                        <span>Total Instant EFT:</span>
                        <span className="text-[#25D366]">R {totalAmount.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-[#0B141A] border border-[#25D366]/20 text-[10px] text-[#DCF8C6]">
                      🖨️ Auto-Fires: <strong>{activeVertical.ticketType}</strong>
                    </div>

                    <a
                      href="/"
                      className="w-full py-2.5 px-3 rounded-xl bg-[#25D366] hover:bg-[#34E574] text-[#06130E] font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Test This Order Live in Merchant Portal →
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. End-to-End 4-Step Workflow Section */}
      <section id="how-it-works" className="py-16 max-w-7xl mx-auto px-6 space-y-10">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#25D366]">
            HOW WHATSAPPEEZY.COM WORKS
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-display">
            From In-Person Demo to Automated Dispatch in 4 Steps
          </h2>
          <p className="text-sm text-slate-400">
            Whether you sell hygiene supplies, burgers &amp; pizzas, building sand, or salon
            appointments—WhatsAppeezy runs your entire storefront inside WhatsApp.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              step: '01',
              icon: Camera,
              title: 'Snap & AI-Enhance Catalog On-The-Spot',
              desc: 'Upload raw product photos during your demo or via WhatsApp. Gemini Vision extracts prices & normalizes images onto a 1024×1024 #F8F9FA studio canvas.',
            },
            {
              step: '02',
              icon: MessageCircle,
              title: 'Customer Orders on WhatsApp',
              desc: 'Customers browse your native WhatsApp Catalog, add items to cart, and drop their GPS delivery pin (or pick a 10-minute service booking slot).',
            },
            {
              step: '03',
              icon: CreditCard,
              title: 'Master PayFast MoR Settlement',
              desc: 'Customers pay via Capitec Pay or Instant EFT into the WhatsAppeezy Master Merchant Account. 100% Verified ITN Split locks in your net payout.',
            },
            {
              step: '04',
              icon: Printer,
              title: 'Instant Kitchen Ticket or Yard Slip',
              desc: 'The moment payment clears, your kitchen prints a Hot-Pass Burger/Pizza Ticket (KOT) or your yard prints a SABS Tipper Loading Slip.',
            },
          ].map((item) => (
            <div key={item.step} className="obsidian-card rounded-2xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-[#005C4B] text-[#DCF8C6]">
                  STEP {item.step}
                </span>
                <item.icon className="w-5 h-5 text-[#25D366]" />
              </div>
              <h3 className="text-base font-bold text-white font-display">{item.title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Interactive Pricing & Weekly Bank Payout Calculator */}
      <section
        id="pricing"
        className="py-16 bg-[#111B21]/90 border-y border-[#25D366]/20"
      >
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#25D366]">
              TRANSPARENT SAAS TIERS &amp; WEEKLY FRIDAY EFT PAYOUTS
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-display">
              Simple Monthly Subscription + Automated Ledger Set-Off
            </h2>
            <p className="text-sm text-slate-400">
              No upfront hardware costs. Your monthly subscription is automatically deducted from your
              collected sales escrow before your weekly Friday payout to FNB, Capitec, Standard Bank,
              Nedbank, or ABSA.
            </p>
          </div>

          {/* Interactive GMV Slider */}
          <div className="obsidian-card rounded-2xl p-6 max-w-3xl mx-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono uppercase text-slate-300 font-bold">
                Simulate Monthly WhatsApp Sales Volume (GMV):
              </span>
              <span className="text-2xl font-extrabold text-[#25D366] font-mono">
                R {monthlyGmv.toLocaleString('en-ZA')} / month
              </span>
            </div>
            <input
              type="range"
              min={20000}
              max={600000}
              step={10000}
              value={monthlyGmv}
              onChange={(e) => setMonthlyGmv(Number(e.target.value))}
              className="w-full accent-[#25D366] cursor-pointer"
            />
          </div>

          {/* 3 Tier Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: 'Starter Store',
                fee: 299,
                commPct: 8.0,
                desc: 'Ideal for takeaways, salons & new WhatsApp stores up to R80k/mo',
                features: [
                  'Dedicated WhatsApp Virtual Number',
                  'Gemini AI 1024×1024 Photo Enhancer',
                  'PayFast Instant EFT & Capitec Pay',
                  'Printable Kitchen KOT & Delivery Slips',
                ],
              },
              {
                name: 'Pro Business',
                fee: 599,
                commPct: 6.5,
                popular: true,
                desc: 'Best for Higiene suppliers, busy restaurants & multi-truck yards',
                features: [
                  'Everything in Starter Store',
                  'Reduced 6.5% Platform Commission',
                  'PostGIS Automated GPS Distance Pricing',
                  'Weekly Friday Bank CSV Batch Payouts',
                ],
              },
              {
                name: 'Enterprise Depot',
                fee: 999,
                commPct: 5.0,
                desc: 'Maximum margin retention for high-volume civil & wholesale depots',
                features: [
                  'Lowest 5.0% Platform Commission',
                  'Lowest 2.5% Gateway Fee Rate',
                  'Multi-Branch Dispatch & Weighbridge Slips',
                  'Dedicated Account Onboarding',
                ],
              },
            ].map((tier) => {
              const estNetPayout = Math.round(
                monthlyGmv * (1 - tier.commPct / 100 - 0.029) - tier.fee
              );
              return (
                <div
                  key={tier.name}
                  className={`obsidian-card rounded-2xl p-6 flex flex-col justify-between relative ${
                    tier.popular ? 'border-2 border-[#25D366] glow-emerald' : ''
                  }`}
                >
                  {tier.popular && (
                    <span className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-[#25D366] text-[#06130E] text-[10px] font-mono font-extrabold uppercase">
                      Most Popular on WhatsAppeezy
                    </span>
                  )}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-white font-display">{tier.name}</h3>
                      <p className="text-xs text-slate-400 mt-1">{tier.desc}</p>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold text-white font-display">
                        R{tier.fee}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">/ month + {tier.commPct}% comm</span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0B141A] border border-[#25D366]/25">
                      <div className="text-[10px] font-mono uppercase text-slate-400">
                        Est. Net Payout on R{monthlyGmv.toLocaleString('en-ZA')} Sales:
                      </div>
                      <div className="text-lg font-extrabold text-[#25D366] font-mono mt-0.5">
                        R {estNetPayout.toLocaleString('en-ZA')} / mo
                      </div>
                    </div>

                    <ul className="space-y-2 text-xs text-slate-300 pt-2">
                      {tier.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#25D366] shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <a
                    href="/"
                    className={`mt-6 w-full py-3 rounded-xl text-xs font-extrabold text-center transition block ${
                      tier.popular
                        ? 'wa-gradient-btn'
                        : 'bg-[#1F2C34] hover:bg-[#2a3b46] text-white border border-[#25D366]/30'
                    }`}
                  >
                    Select {tier.name} &amp; Open Portal →
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. Gemini + Antigravity Co-Build Prompt Blueprint */}
      <section id="gemini-prompts" className="py-16 max-w-7xl mx-auto px-6 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#25D366]">
              GEMINI FLASH + ANTIGRAVITY AI ENGINE
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-display mt-1">
              Built-In Gemini AI Prompts Powering WhatsAppeezy.com
            </h2>
          </div>
          <a
            href="/"
            className="px-4 py-2 rounded-xl bg-[#005C4B] text-[#DCF8C6] text-xs font-bold border border-[#25D366]/40 hover:bg-[#075E54] transition"
          >
            Run Live in Portal Tab 4 (Gemini Studio) →
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {GEMINI_ANTIGRAVITY_PROMPTS.map((item, idx) => (
            <div key={idx} className="obsidian-card rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2.5">
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded bg-[#005C4B] text-[#25D366]">
                  {item.tag}
                </span>
                <h3 className="text-sm font-bold text-white font-display">{item.title}</h3>
                <p className="text-xs text-slate-300 font-mono bg-[#0B141A] p-3 rounded-xl border border-white/5 leading-relaxed">
                  &ldquo;{item.prompt}&rdquo;
                </p>
              </div>
              <button
                onClick={() => handleCopyPrompt(item.prompt, idx)}
                className="w-full py-2 rounded-xl bg-[#1F2C34] hover:bg-[#283842] text-xs font-bold text-[#DCF8C6] flex items-center justify-center gap-1.5 border border-[#25D366]/20 transition"
              >
                {copiedIdx === idx ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#25D366]" />
                    Copied Prompt!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#25D366]" />
                    Copy Gemini Prompt
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 7. Instant Customer Onboarding CTA Section */}
      <section
        id="onboard-now"
        className="py-16 bg-gradient-to-b from-[#0B141A] to-[#075E54]/40 border-t border-[#25D366]/20"
      >
        <div className="max-w-4xl mx-auto px-6">
          <div className="obsidian-card rounded-3xl p-8 sm:p-10 border-2 border-[#25D366]/50 space-y-6 text-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#005C4B] text-[#DCF8C6] text-xs font-mono">
              🚀 LIVE ON WHATSAPPEEZY.COM
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-display">
              Ready to Load Your Customer&apos;s Catalog on WhatsAppeezy?
            </h2>
            <p className="text-sm text-slate-300 max-w-xl mx-auto">
              Enter your business or client details below to launch straight into the{' '}
              <strong className="text-[#25D366]">WhatsAppeezy Merchant Command Portal</strong> with
              instant AI photo enhancement.
            </p>

            {!leadSubmitted ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2">
                <input
                  type="text"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Business Name (e.g. Higiene)"
                  className="rounded-xl bg-[#0B141A] border border-[#25D366]/40 px-4 py-3 text-xs text-white focus:outline-none focus:border-[#25D366]"
                />
                <input
                  type="text"
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  placeholder="WhatsApp Number (+27...)"
                  className="rounded-xl bg-[#0B141A] border border-[#25D366]/40 px-4 py-3 text-xs font-mono text-white focus:outline-none focus:border-[#25D366]"
                />
                <button
                  onClick={() => setLeadSubmitted(true)}
                  className="wa-gradient-btn rounded-xl px-5 py-3 text-xs font-extrabold transition"
                >
                  Activate on WhatsAppeezy →
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-[#005C4B] border border-[#25D366] text-[#DCF8C6] text-xs space-y-3 max-w-xl mx-auto">
                <div className="font-bold text-sm text-white">
                  ✅ {leadName || 'Your Business'} is ready for AI Catalog Onboarding!
                </div>
                <a
                  href="/"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#25D366] text-[#06130E] font-extrabold text-xs"
                >
                  Open Merchant Command Portal &amp; Load Photos Now →
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#080F14] border-t border-[#1F2C34] py-8 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white font-display">WhatsAppeezy.com</span>
            <span>• Official South African WhatsApp Commerce &amp; PayFast MoR Aggregator</span>
          </div>
          <div className="flex items-center gap-4 font-mono">
            <a href="/" className="text-[#25D366] hover:underline">
              Merchant Portal
            </a>
            <a href="/sell-sheet" className="text-[#DCF8C6] hover:underline">
              B2B Printable Sell-Sheet
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
