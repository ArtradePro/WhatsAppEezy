'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  Truck,
  PackageCheck,
  Clock,
  CheckCircle2,
  Printer,
  RefreshCw,
  Bell,
  Download,
  Coins,
  Layers,
  Sparkles,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  Calculator,
  Receipt,
  PlusCircle,
  Code2,
  Cpu,
  Check,
  Building2,
  Calendar,
  PhoneCall,
  Trash2,
  Edit3,
  Send,
} from 'lucide-react';
import {
  MOCK_ORDERS_LIST,
  MOCK_DEFAULT_VENDOR,
  MOCK_VENDORS_LIST,
  MOCK_INITIAL_PRODUCTS,
  MOCK_LEDGER_ENTRIES,
  MOCK_APPOINTMENTS_LIST,
} from '../lib/mock-data';
import {
  Vendor,
  Product,
  LedgerEntry,
  VendorSubscriptionTier,
  ServiceAppointment,
} from '../lib/types';
import { WaybillPreviewModal } from '../components/waybill-preview-modal';
import { UploadProductModal } from '../components/upload-product-modal';
import { LiveWhatsAppDemoCockpit } from '../components/live-whatsapp-demo-cockpit';
import { AddVendorModal } from '../components/add-vendor-modal';

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  total_price: number;
}

interface DashboardOrder {
  id: string;
  order_ref: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  distance_km: number;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  vendor_payout: number;
  current_status: 'paid' | 'dispatched' | 'delivered';
  materials_breakdown?: string;
  created_at: string;
  items: OrderItem[];
}

type ActiveTab = 'dispatch' | 'revenue' | 'catalog' | 'ai_bridge';

const TIER_CONFIGS: Record<
  VendorSubscriptionTier,
  {
    label: string;
    monthlyFee: number;
    commissionRate: number;
    billedPct: number;
    billedFixed: number;
    actualPct: number;
    actualFixed: number;
    badgeColor: string;
    tagline: string;
  }
> = {
  starter: {
    label: 'Starter Yard',
    monthlyFee: 299,
    commissionRate: 0.08,
    billedPct: 0.032,
    billedFixed: 2.0,
    actualPct: 0.02,
    actualFixed: 1.5,
    badgeColor: 'border-slate-600 bg-slate-800/80 text-slate-200',
    tagline: 'Ideal for single-quarry operators up to R80k/mo GMV',
  },
  pro: {
    label: 'Pro Fleet',
    monthlyFee: 599,
    commissionRate: 0.065,
    billedPct: 0.029,
    billedFixed: 2.0,
    actualPct: 0.02,
    actualFixed: 1.5,
    badgeColor: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
    tagline: 'Preferred for multi-tipper yards up to R250k/mo GMV',
  },
  enterprise: {
    label: 'Enterprise Depot',
    monthlyFee: 999,
    commissionRate: 0.05,
    billedPct: 0.025,
    billedFixed: 1.75,
    actualPct: 0.02,
    actualFixed: 1.5,
    badgeColor: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
    tagline: 'Maximum margin retention for high-volume civil suppliers',
  },
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function VendorDashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dispatch');
  const [vendorsList, setVendorsList] = useState<Vendor[]>(MOCK_VENDORS_LIST);
  const [selectedVendor, setSelectedVendor] = useState<Vendor>(MOCK_DEFAULT_VENDOR);
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [appointments, setAppointments] = useState<ServiceAppointment[]>(MOCK_APPOINTMENTS_LIST);
  const [products, setProducts] = useState<Product[]>(MOCK_INITIAL_PRODUCTS);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>(MOCK_LEDGER_ENTRIES);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedWaybillOrder, setSelectedWaybillOrder] = useState<any | null>(null);
  const [isWaybillOpen, setIsWaybillOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAddVendorModalOpen, setIsAddVendorModalOpen] = useState(false);
  const [showDemoCockpit, setShowDemoCockpit] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'dispatched' | 'delivered'>('all');

  // Interactive Draft Approval & Price Edit State
  const [editingPriceProductId, setEditingPriceProductId] = useState<string | null>(null);
  const [priceEditInput, setPriceEditInput] = useState<string>('R620 per m3');
  const [simUploadCaption, setSimUploadCaption] = useState<string>(
    '19mm Crushed Concrete Stone R640 per m3'
  );
  const [selectedBankFormat, setSelectedBankFormat] = useState<
    'fnb' | 'capitec' | 'standard_bank' | 'nedbank' | 'absa' | 'acb'
  >('fnb');

  // MoR Revenue & Fee Arbitrage Simulator State
  const [selectedTier, setSelectedTier] = useState<VendorSubscriptionTier>('pro');
  const [simSubtotal, setSimSubtotal] = useState<number>(3300);
  const [simHaulage, setSimHaulage] = useState<number>(562.4);
  const [subscriptionSetoffApplied, setSubscriptionSetoffApplied] = useState(false);

  // Antigravity Gemini Flash Studio State (OpenAI Cross-Build Bridge Locked OFF)
  const [openAiKeyInput, setOpenAiKeyInput] = useState('');
  const [savedOpenAiKey, setSavedOpenAiKey] = useState('');
  const [bridgeTaskType, setBridgeTaskType] = useState<
    'REVENUE_ARBITRAGE_ADVISOR' | 'DISPATCH_LOAD_OPTIMIZER' | 'CATALOG_PRODUCT_GENERATOR' | 'UI_COBUILDER_ARCHITECT'
  >('REVENUE_ARBITRAGE_ADVISOR');
  const [bridgePrompt, setBridgePrompt] = useState(
    'Analyze my R411k monthly GMV and calculate whether Pro or Enterprise tier maximizes my net EFT payout.'
  );
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeResult, setBridgeResult] = useState<any | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/vendor/orders');
      if (res.ok) {
        const data = await res.json();
        if (data.orders && data.orders.length > 0) {
          setOrders(data.orders);
          return;
        }
      }
    } catch {
      // Fallback to local state
    }

    if (orders.length === 0) {
      const initial: DashboardOrder[] = MOCK_ORDERS_LIST.map((o) => ({
        id: o.id,
        order_ref: o.order_ref,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone,
        delivery_address: o.delivery_address,
        distance_km: o.distance_km,
        subtotal: o.subtotal,
        delivery_fee: o.delivery_fee,
        total_amount: o.total_amount,
        vendor_payout: o.vendor_payout,
        current_status:
          o.current_status === 'dispatched' || o.current_status === 'delivered'
            ? o.current_status
            : 'paid',
        materials_breakdown: o.materials_breakdown,
        created_at: o.created_at,
        items: (o.items || []).map((i) => ({
          id: i.id,
          product_name: i.product_title || 'Building Materials',
          quantity: i.quantity,
          unit: 'm³',
          total_price: i.total_price,
        })),
      }));
      setOrders(initial);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedKey = window.localStorage.getItem('CARGODASH_OPENAI_KEY') || '';
      if (storedKey) {
        setSavedOpenAiKey(storedKey);
        setOpenAiKeyInput(storedKey);
      }
    }
    fetchOrders().finally(() => setLoading(false));
  }, []);

  // Live MoR Fee Arbitrage Settlement Calculation
  const settlementPreview = useMemo(() => {
    const cfg = TIER_CONFIGS[selectedTier];
    const gross_amount = round2(simSubtotal + simHaulage);
    const platform_commission = round2(gross_amount * cfg.commissionRate);
    const payment_fee_charged = round2(gross_amount * cfg.billedPct + cfg.billedFixed);
    const payment_fee_actual = round2(gross_amount * cfg.actualPct + cfg.actualFixed);
    const gateway_margin_spread = round2(payment_fee_charged - payment_fee_actual);
    const net_vendor_payout = round2(gross_amount - (platform_commission + payment_fee_charged));
    const total_platform_yield = round2(platform_commission + gateway_margin_spread);

    return {
      gross_amount,
      platform_commission,
      payment_fee_charged,
      payment_fee_actual,
      gateway_margin_spread,
      net_vendor_payout,
      total_platform_yield,
      vendorRetentionPct: gross_amount > 0 ? round2((net_vendor_payout / gross_amount) * 100) : 0,
      platformYieldPct: gross_amount > 0 ? round2((total_platform_yield / gross_amount) * 100) : 0,
    };
  }, [selectedTier, simSubtotal, simHaulage]);

  // Update order dispatch status
  const updateStatus = async (orderId: string, nextStatus: 'dispatched' | 'delivered') => {
    try {
      await fetch(`/api/vendor/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
    } catch {
      // Optimistic local state update
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, current_status: nextStatus } : o))
    );
    const found = orders.find((o) => o.id === orderId);
    if (nextStatus === 'dispatched') {
      showToast(
        `🚚 WhatsApp Dispatched Alert + Live ETA sent to ${found?.customer_name} (${found?.order_ref})`
      );
    } else {
      showToast(
        `✅ Delivery Confirmed for ${found?.order_ref}. Escrow payout unlocked for Friday EFT batch.`
      );
    }
  };

  // Send Live Customer Order Tracking / ETA Ping
  const handleSendCustomerEtaPing = (order: DashboardOrder) => {
    showToast(
      `📍 Sent Live WhatsApp Tracking Pin & 15-min Tipper ETA to ${order.customer_name} (${order.customer_phone})`
    );
  };

  // Service Appointment Actions (Confirm / Remind / Complete)
  const handleAppointmentAction = (
    apptId: string,
    action: 'confirm' | 'remind' | 'complete'
  ) => {
    const target = appointments.find((a) => a.id === apptId);
    if (!target) return;

    if (action === 'remind') {
      showToast(
        `🔔 Sent 1-Hour WhatsApp Appointment Reminder to ${target.customer_name} (${target.customer_phone})`
      );
      return;
    }

    const nextStatus = action === 'confirm' ? 'confirmed' : 'completed';
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === apptId
          ? {
              ...a,
              status: nextStatus,
              payfast_pf_payment_id: a.payfast_pf_payment_id || `PF-APT-${Date.now().toString().slice(-4)}`,
            }
          : a
      )
    );
    showToast(
      action === 'confirm'
        ? `✅ Confirmed slot for ${target.customer_name} (10-min hold converted to paid booking)`
        : `🎉 Marked ${target.service_title} completed for ${target.customer_name}`
    );
  };

  // Simulate Inbound WhatsApp Vendor Image Upload -> PROCESS_CATALOG_INGESTION Draft
  const handleSimulateWhatsAppImageUpload = () => {
    const priceMatch = simUploadCaption.match(/(?:R|ZAR)\s*([0-9]+(?:[\.,][0-9]{1,2})?)/i);
    const extractedPrice = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 640;
    const unit = simUploadCaption.toLowerCase().includes('1000')
      ? 'per 1000 bricks'
      : simUploadCaption.toLowerCase().includes('bag')
      ? 'per bag'
      : 'per m3';
    const cleanTitle = simUploadCaption.split(/R\d+/i)[0]?.trim() || 'Normalized Vendor Upload';

    const draftProd: Product = {
      id: `draft_${Date.now().toString().slice(-5)}`,
      vendor_id: selectedVendor.id,
      title: cleanTitle,
      category: 'sand_stone',
      unit_of_measure: unit,
      unit_price: extractedPrice,
      is_available: false, // Pre-publish gate
      meta_retailer_id: null, // Not published until vendor taps [Approve & Publish]
      image_url:
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
      raw_image_url: `https://res.cloudinary.com/mock-cloud/image/upload/v1/whatsapp-vendor-raw/raw_${Date.now()}.jpg`,
      enhanced_image_url: `https://res.cloudinary.com/mock-cloud/image/upload/v1/whatsapp-vendor-products/norm_1024x1024_${Date.now()}.webp`,
      description: `Specs: Sharp 1024x1024 (#F8F9FA) Normalized | Auto-Contrast & WebP (<500KB) | Caption Override: R${extractedPrice} ${unit}`,
    };

    setProducts((prev) => [draftProd, ...prev]);
    showToast(
      `📸 PROCESS_CATALOG_INGESTION created pre-publish draft "${draftProd.title}" — awaiting [Approve & Publish]`
    );
  };

  // Interactive Approval Gate: [publish_listing_{product_id}]
  const handlePublishDraft = (productId: string) => {
    const sku = `SKU-VND-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? { ...p, is_available: true, meta_retailer_id: sku }
          : p
      )
    );
    showToast(
      `✅ Live! Your product is now visible on your customer catalog (${selectedVendor.meta_catalog_id || 'cat_brickdirect_001'} -> ${sku})`
    );
  };

  // Interactive Approval Gate: [edit_price_{product_id}] -> WAITING_FOR_PRICE_EDIT
  const handleApplyPriceEdit = (productId: string) => {
    const priceMatch = priceEditInput.match(/([0-9]+(?:[\.,][0-9]{1,2})?)/);
    const newPrice = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 620;
    const lower = priceEditInput.toLowerCase();
    const newUnit =
      lower.includes('m3') || lower.includes('cube')
        ? 'per m3'
        : lower.includes('1000') || lower.includes('brick')
        ? 'per 1000 bricks'
        : lower.includes('bag')
        ? 'per bag'
        : undefined;

    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              unit_price: newPrice,
              unit_of_measure: newUnit || p.unit_of_measure,
            }
          : p
      )
    );
    setEditingPriceProductId(null);
    showToast(
      `✏️ WAITING_FOR_PRICE_EDIT applied: Updated draft to R${newPrice.toFixed(2)} ${newUnit || ''} and re-dispatched preview card!`
    );
  };

  // Interactive Approval Gate: [discard_{product_id}] -> Delete DB record & purge CDN assets
  const handleDiscardDraft = (productId: string) => {
    const target = products.find((p) => p.id === productId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    showToast(
      `🗑️ Draft discarded. Purged raw & 1024x1024 CDN assets for "${target?.title || productId}".`
    );
  };

  // Apply Monthly SaaS Subscription Ledger Set-Off
  const handleApplySubscriptionSetoff = () => {
    const tierCfg = TIER_CONFIGS[selectedTier];
    const currentEscrowBalance =
      ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance_after : 10327.5;
    const newBalance = round2(Math.max(0, currentEscrowBalance - tierCfg.monthlyFee));

    const newEntry: LedgerEntry = {
      id: `led_setoff_${Date.now()}`,
      order_id: 'SAAS-CYCLE-2026-10',
      order_ref: 'SAAS-2026-10',
      vendor_id: selectedVendor.id,
      entry_type: 'saas_subscription_setoff',
      debit: tierCfg.monthlyFee,
      credit: 0,
      balance_after: newBalance,
      reference: `Monthly SaaS Set-Off (${tierCfg.label} Tier — R${tierCfg.monthlyFee}.00 deducted from escrow)`,
      created_at: new Date().toISOString(),
    };

    setLedgerEntries((prev) => [...prev, newEntry]);
    setSubscriptionSetoffApplied(true);
    showToast(
      `💳 Deducted R${tierCfg.monthlyFee.toFixed(2)} (${tierCfg.label} SaaS Fee) from unsettled escrow via Automated Ledger Set-Off.`
    );
  };

  // Run Antigravity Gemini Flash Studio Task
  const runOpenAiBridge = async (
    overrideType?: typeof bridgeTaskType,
    overridePrompt?: string
  ) => {
    const taskType = overrideType || bridgeTaskType;
    const prompt = overridePrompt || bridgePrompt;
    setBridgeLoading(true);

    try {
      const totalGmv = orders.reduce((s, o) => s + o.total_amount, 0) + 382400;
      const res = await fetch('/api/ai/bridge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(savedOpenAiKey ? { 'x-openai-api-key': savedOpenAiKey } : {}),
        },
        body: JSON.stringify({
          taskType,
          prompt,
          apiKey: savedOpenAiKey || undefined,
          context: {
            vendorId: selectedVendor.id,
            businessName: selectedVendor.business_name,
            subscriptionTier: selectedTier,
            monthlyGmvZar: totalGmv,
            monthlyOrderCount: orders.length + 84,
            sampleOrderSubtotal: simSubtotal,
            sampleOrderHaulage: simHaulage,
            activeOrdersCount: orders.filter((o) => o.current_status !== 'delivered').length,
          },
        }),
      });

      const data = await res.json();
      setBridgeResult(data);
      showToast(`⚡ Antigravity Gemini Flash synthesis completed`);
    } catch (err: any) {
      showToast(`⚠️ Engine notice: ${err.message}`);
    } finally {
      setBridgeLoading(false);
    }
  };

  const handleSaveApiKey = () => {
    const trimmed = openAiKeyInput.trim();
    setSavedOpenAiKey(trimmed);
    if (typeof window !== 'undefined') {
      if (trimmed) {
        window.localStorage.setItem('CARGODASH_OPENAI_KEY', trimmed);
      } else {
        window.localStorage.removeItem('CARGODASH_OPENAI_KEY');
      }
    }
    showToast(
      trimmed
        ? '🔑 Gemini Flash API Key saved'
        : 'Cleared custom key — using server .env or deterministic engine'
    );
  };

  const handleAddGeneratedProduct = (genProd: any) => {
    if (!genProd) return;
    const newProduct: Product = {
      id: `prod_ai_${Date.now()}`,
      vendor_id: selectedVendor.id,
      title: genProd.title,
      category: genProd.category || 'sand_stone',
      unit_of_measure: genProd.unit_of_measure || 'per m3',
      unit_price: Number(genProd.unit_price) || 550,
      is_available: true,
      image_url:
        'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80',
      meta_retailer_id: genProd.meta_retailer_id || `SKU-VND-${Date.now().toString().slice(-4)}`,
      description: genProd.description,
    };
    setProducts((prev) => [newProduct, ...prev]);
    setActiveTab('catalog');
    showToast(`📦 Published "${newProduct.title}" to WhatsApp Catalog inventory!`);
  };

  const handleExportBankCsv = (
    formatOverride?: 'fnb' | 'capitec' | 'standard_bank' | 'nedbank' | 'absa' | 'acb'
  ) => {
    const bankFormat = formatOverride || selectedBankFormat;
    const netEscrow =
      ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance_after : 26700.61;
    const headers = [
      'Bank Format,Recipient Name,Bank Name,Branch Code,Account Number,Account Type,Net EFT Amount (ZAR),SaaS Set-Off Applied,Beneficiary Reference,Status',
    ];
    const row = `"${bankFormat.toUpperCase()}","${selectedVendor.bank_account_holder}","${selectedVendor.bank_name}","${selectedVendor.bank_branch_code}","${selectedVendor.bank_account_number}","CURRENT","${netEscrow.toFixed(2)}","${subscriptionSetoffApplied ? 'YES' : 'AUTO'}","CARGODASH-WK-SETTLE","READY"`;
    const ext = bankFormat === 'acb' ? 'ACB' : 'csv';
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, row].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cargodash-${bankFormat}-payout-${selectedVendor.slug}.${ext}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(
      `🏦 Downloaded ${bankFormat.toUpperCase()} Weekly Payout Batch (R ${netEscrow.toFixed(2)})`
    );
  };

  const paidOrders = orders.filter((o) => o.current_status === 'paid');
  const dispatchedOrders = orders.filter((o) => o.current_status === 'dispatched');
  const deliveredOrders = orders.filter((o) => o.current_status === 'delivered');
  const filteredOrders =
    statusFilter === 'all' ? orders : orders.filter((o) => o.current_status === statusFilter);

  const currentEscrowBalance =
    ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance_after : 10327.5;

  const totalPlatformSpreadRetained = ledgerEntries
    .filter((e) => e.entry_type === 'payment_spread_retained')
    .reduce((sum, e) => sum + e.debit, 0);

  const totalPlatformCommEarned = ledgerEntries
    .filter((e) => e.entry_type === 'platform_commission_earned')
    .reduce((sum, e) => sum + e.debit, 0);

  const draftProductsCount = products.filter((p) => !p.meta_retailer_id).length;

  const handleSimulateLiveWhatsAppOrderToTicket = async () => {
    let pfId = `PF-MOR-${Date.now().toString().slice(-5)}`;
    try {
      const res = await fetch('/api/v1/payments/payfast/sandbox-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: 'Capitec Pay / Instant EFT',
          businessType: selectedVendor.business_type,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pfPaymentId) pfId = data.pfPaymentId;
      }
    } catch {
      // Continue with local interactive order + MoR ledger creation
    }

    const isKitchenVendor =
      selectedVendor.business_name.toLowerCase().includes('kitchen') ||
      selectedVendor.business_name.toLowerCase().includes('pizza');

    const orderRef = isKitchenVendor
      ? `KOT-2026-${Math.floor(8930 + Math.random() * 90)}`
      : `ORD-2026-${Math.floor(8930 + Math.random() * 90)}`;

    const subtotalAmt = isKitchenVendor ? 475.0 : 3300.0;
    const deliveryAmt = isKitchenVendor ? 57.1 : 562.4;
    const grossAmt = round2(subtotalAmt + deliveryAmt);
    const cfg = TIER_CONFIGS[selectedTier];
    const commAmt = round2(grossAmt * cfg.commissionRate);
    const billedFee = round2(grossAmt * cfg.billedPct + cfg.billedFixed);
    const actualFee = round2(grossAmt * cfg.actualPct + cfg.actualFixed);
    const spreadAmt = round2(billedFee - actualFee);
    const netVendorAmt = round2(grossAmt - (commAmt + billedFee));

    const newOrder: DashboardOrder = {
      id: `ord_live_${Date.now()}`,
      order_ref: orderRef,
      customer_name: isKitchenVendor
        ? 'Marco Rossi (WhatsApp Food Order)'
        : 'Vernon Builder (WhatsApp Site Order)',
      customer_phone: '+27829014422',
      delivery_address: isKitchenVendor
        ? 'Unit 14B, The Tyrwhitt, Rosebank'
        : 'Stand 402, Albertinia Industrial Park',
      distance_km: isKitchenVendor ? 3.4 : 14.2,
      subtotal: subtotalAmt,
      delivery_fee: deliveryAmt,
      total_amount: grossAmt,
      vendor_payout: netVendorAmt,
      current_status: 'paid',
      materials_breakdown: isKitchenVendor
        ? '2x Double Wagyu Smash Burger Combo + 1x Woodfired Margherita Pizza XL (Kitchen Grill Station #1)'
        : '6m³ Plaster Sand (Washed Malmesbury Grade — Tipper Bin #2)',
      created_at: new Date().toISOString(),
      items: [
        {
          id: `itm_${Date.now()}`,
          product_name: isKitchenVendor
            ? 'Double Wagyu Smash Burger & Rosemary Fries'
            : 'Plaster Sand (Washed Malmesbury Grade)',
          quantity: isKitchenVendor ? 2 : 6,
          unit: isKitchenVendor ? 'combo' : 'm³',
          total_price: subtotalAmt,
        },
      ],
    };

    setOrders((prev) => [newOrder, ...prev]);

    const prevBal =
      ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance_after : 10327.5;
    const nowIso = new Date().toISOString();
    const newLedgerRows: LedgerEntry[] = [
      {
        id: `led_${Date.now()}_1`,
        order_id: newOrder.id,
        order_ref: orderRef,
        vendor_id: selectedVendor.id,
        entry_type: 'customer_payment_received',
        debit: 0,
        credit: grossAmt,
        balance_after: round2(prevBal + grossAmt),
        reference: `PayFast Master MoR Credit (${pfId})`,
        created_at: nowIso,
      },
      {
        id: `led_${Date.now()}_2`,
        order_id: newOrder.id,
        order_ref: orderRef,
        vendor_id: selectedVendor.id,
        entry_type: 'platform_commission_earned',
        debit: commAmt,
        credit: 0,
        balance_after: round2(prevBal + grossAmt - commAmt),
        reference: `Platform Commission (${(cfg.commissionRate * 100).toFixed(1)}% ${cfg.label})`,
        created_at: nowIso,
      },
      {
        id: `led_${Date.now()}_3`,
        order_id: newOrder.id,
        order_ref: orderRef,
        vendor_id: selectedVendor.id,
        entry_type: 'payment_spread_retained',
        debit: spreadAmt,
        credit: 0,
        balance_after: round2(prevBal + grossAmt - commAmt - spreadAmt),
        reference: `PayFast Gateway Fee Arbitrage Spread Retained`,
        created_at: nowIso,
      },
      {
        id: `led_${Date.now()}_4`,
        order_id: newOrder.id,
        order_ref: orderRef,
        vendor_id: selectedVendor.id,
        entry_type: 'gateway_fee_disbursed',
        debit: actualFee,
        credit: 0,
        balance_after: round2(prevBal + netVendorAmt),
        reference: `Wholesale PayFast Cost Disbursed (Net Escrow +R${netVendorAmt.toFixed(2)})`,
        created_at: nowIso,
      },
    ];
    setLedgerEntries((prev) => [...prev, ...newLedgerRows]);

    setSelectedWaybillOrder({
      ...newOrder,
      payfast_pf_payment_id: pfId,
    });
    setIsWaybillOpen(true);

    showToast(
      `✅ Master PayFast MoR Paid (${pfId})! Net R${netVendorAmt.toFixed(2)} credited & ${
        isKitchenVendor ? 'Kitchen Order Ticket (KOT)' : 'Tipper Loading Slip'
      } #${orderRef} fired to ${selectedVendor.business_name}!`
    );
  };

  return (
    <div className="min-h-screen bg-telemetry-canvas text-slate-100 flex flex-col">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-emerald-600/95 backdrop-blur-md text-white px-5 py-3.5 rounded-xl shadow-2xl border border-emerald-400/50 glow-emerald">
          <Bell className="w-5 h-5 shrink-0" />
          <span className="font-semibold text-sm">{toastMessage}</span>
        </div>
      )}

      {/* Top Real-Time WhatsApp Deep Teal Telemetry Ribbon */}
      <div className="wa-teal-header border-b border-[#25D366]/30 text-[11px] font-mono text-white">
        <div className="max-w-7xl mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-[#DCF8C6] font-bold">
              <span className="w-2 h-2 rounded-full bg-[#25D366] animate-ping" />
              WHATSAPPEEZY.COM // MASTER PAYFAST MoR ENGINE: LIVE
            </span>
            <span className="hidden sm:inline text-white/30">|</span>
            <span className="hidden sm:inline text-white/90">
              META CLOUD API: <strong className="text-[#25D366]">38ms</strong>
            </span>
            <span className="hidden md:inline text-white/30">|</span>
            <span className="hidden md:inline text-white/90">
              GEMINI FLASH VISION: <strong className="text-[#DCF8C6]">1024×1024 STUDIO READY</strong>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/website"
              className="px-2.5 py-0.5 rounded-full bg-[#25D366] text-[#06130E] font-extrabold hover:bg-[#34E574] transition"
            >
              🌐 View Official Website (whatsappeezy.com) →
            </a>
            <button
              onClick={() => setShowDemoCockpit((prev) => !prev)}
              className="text-[#DCF8C6] hover:text-white underline font-semibold"
            >
              {showDemoCockpit ? 'Hide Handset Cockpit ▲' : 'Show Handset Cockpit ▼'}
            </button>
          </div>
        </div>
      </div>

      {/* Top Command Deck Header */}
      <header className="border-b border-[#25D366]/20 bg-[#111B21]/95 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center shadow-lg glow-emerald">
                <Truck className="w-6 h-6 text-[#06130E]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-extrabold uppercase tracking-wider text-[#25D366]">
                    WHATSAPPEEZY.COM // MERCHANT PORTAL
                  </span>
                  <span
                    className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${TIER_CONFIGS[selectedTier].badgeColor}`}
                  >
                    {TIER_CONFIGS[selectedTier].label.toUpperCase()} • R
                    {TIER_CONFIGS[selectedTier].monthlyFee}/mo
                  </span>
                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full border border-[#25D366]/40 bg-[#005C4B] text-[#DCF8C6]">
                    📞 {selectedVendor.whatsapp_number}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-display mt-0.5">
                  {selectedVendor.business_name}
                </h1>
              </div>
            </div>

            {/* Right Action Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/website"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#005C4B] hover:bg-[#075E54] text-[#DCF8C6] border border-[#25D366]/40 text-xs font-extrabold transition"
              >
                🌐 whatsappeezy.com Website
              </a>

              <button
                onClick={() => setIsAddVendorModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-lg transition"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                + New Customer / Company
              </button>

              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="wa-gradient-btn flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                📸 Load &amp; AI-Enhance Catalog
              </button>

              <button
                onClick={handleSimulateLiveWhatsAppOrderToTicket}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1F2C34] hover:bg-[#2a3b46] text-[#25D366] text-xs font-bold border border-[#25D366]/40 transition"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#25D366]" />
                📲 Simulate Order → PayFast → Ticket
              </button>

              <a
                href="/sell-sheet"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1F2C34] hover:bg-[#2a3b46] text-[#DCF8C6] border border-slate-700 text-xs font-bold transition"
              >
                <Printer className="w-3.5 h-3.5 text-[#25D366]" />
                QR Sell-Sheet
              </a>

              <select
                aria-label="Select SA Bank Export Format"
                value={selectedBankFormat}
                onChange={(e) => setSelectedBankFormat(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-slate-950 text-slate-200 text-xs font-mono border border-slate-800"
              >
                <option value="fnb">FNB Host-to-Host CSV</option>
                <option value="capitec">Capitec Business CSV</option>
                <option value="standard_bank">Standard Bank CSV</option>
                <option value="nedbank">Nedbank CPS CSV</option>
                <option value="absa">ABSA CashFocus CSV</option>
                <option value="acb">SARB ACB Fixed-Width</option>
              </select>

              <button
                onClick={() => handleExportBankCsv()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700 transition"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                EFT Batch
              </button>
            </div>
          </div>

          {/* 1-Click Multi-Vertical Company Switcher Pills for Live Customer Pitches */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/70">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mr-1">
              Active Customer / Company:
            </span>
            {vendorsList.map((v) => {
              const isSelected = v.id === selectedVendor.id;
              const nameLow = v.business_name.toLowerCase();
              const isRest = nameLow.includes('kitchen') || nameLow.includes('pizza');
              const isHyg = nameLow.includes('higiene') || nameLow.includes('hygiene');
              const isSal = v.business_type === 'service_booking';
              const icon = isHyg
                ? '🧴'
                : isRest
                ? '🍔'
                : isSal
                ? '💇‍♀️'
                : v.subscription_tier === 'enterprise'
                ? '⛰️'
                : '🧱';

              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedVendor(v);
                    if (v.subscription_tier) setSelectedTier(v.subscription_tier);
                    showToast(
                      `Switched active company to ${v.business_name} (${v.whatsapp_number})`
                    );
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300 shadow-sm'
                      : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span>{icon}</span>
                  <span>{v.business_name}</span>
                  <span className="text-[10px] font-mono opacity-75 hidden sm:inline">
                    [{v.whatsapp_number}]
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => setIsAddVendorModalOpen(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 transition flex items-center gap-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              + Add Customer (e.g. Higiene)
            </button>
          </div>
        </div>

        {/* 4-Workspace Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-2 overflow-x-auto border-t border-slate-800/70 pt-1">
          <button
            onClick={() => setActiveTab('dispatch')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === 'dispatch'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            1. Live Dispatch &amp; Tickets ({orders.length})
          </button>

          <button
            onClick={() => setActiveTab('revenue')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === 'revenue'
                ? 'border-amber-400 text-amber-300 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-4 h-4" />
            2. Master PayFast MoR Ledger &amp; SaaS Set-Off
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === 'catalog'
                ? 'border-sky-400 text-sky-300 bg-sky-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            3. AI Studio Catalog &amp; Approval Gate ({products.length})
          </button>

          <button
            onClick={() => setActiveTab('ai_bridge')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === 'ai_bridge'
                ? 'border-purple-400 text-purple-300 bg-purple-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            4. Cloud Virtual Numbers, Zero-Data &amp; Gemini Flash
          </button>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="max-w-7xl w-full mx-auto px-6 py-7 flex-1 space-y-7">
        {/* Live WhatsApp Handset & Customer Demo Cockpit */}
        {showDemoCockpit && (
          <LiveWhatsAppDemoCockpit
            vendor={selectedVendor}
            products={products}
            onOpenAiPhotoModal={() => setIsUploadModalOpen(true)}
            onTriggerLiveOrder={handleSimulateLiveWhatsAppOrderToTicket}
          />
        )}

        {/* ============================================================
            WORKSPACE 1: LIVE DISPATCH & WAYBILLS
           ============================================================ */}
        {activeTab === 'dispatch' && (
          <>
            {/* Top Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="obsidian-card rounded-2xl p-5">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono font-semibold uppercase tracking-wider">
                  <span>Ready to Prep / Load (Paid)</span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-3xl font-extrabold text-white font-display">
                    {paidOrders.length}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                    {selectedVendor.business_name.toLowerCase().includes('kitchen')
                      ? 'Hot-Pass Queue'
                      : 'Awaiting Tipper'}
                  </span>
                </div>
              </div>

              <div className="obsidian-card rounded-2xl p-5">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono font-semibold uppercase tracking-wider">
                  <span>In Transit (Dispatched)</span>
                  <Truck className="w-4 h-4 text-sky-400" />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-3xl font-extrabold text-white font-display">
                    {dispatchedOrders.length}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-sky-300 bg-sky-500/15 px-2.5 py-0.5 rounded-full border border-sky-500/30">
                    En Route
                  </span>
                </div>
              </div>

              <div className="obsidian-card rounded-2xl p-5">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono font-semibold uppercase tracking-wider">
                  <span>Completed Deliveries</span>
                  <PackageCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-3xl font-extrabold text-white font-display">
                    {deliveredOrders.length}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    POD Verified
                  </span>
                </div>
              </div>

              <div
                onClick={() => setActiveTab('revenue')}
                className="obsidian-card rounded-2xl p-5 cursor-pointer border-emerald-500/40 hover:border-emerald-400 transition"
              >
                <div className="flex items-center justify-between text-emerald-300 text-[11px] font-mono font-semibold uppercase tracking-wider">
                  <span>Unsettled Escrow Balance</span>
                  <Coins className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold text-emerald-400 font-display">
                    R {currentEscrowBalance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] font-mono text-slate-300 underline">
                    MoR Ledger →
                  </span>
                </div>
              </div>
            </div>

            {/* Dispatch Filter & AI Optimizer Banner */}
            <div className="obsidian-card rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white font-display">
                    Live Multi-Vertical Dispatch &amp; Kitchen/Yard Ticket Queue
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Click <strong>Slip</strong> on any order to print either a{' '}
                    <strong>Kitchen Order Ticket (KOT)</strong> for burgers/pizzas or an{' '}
                    <strong>SABS Weighbridge Tipper Loading Slip</strong> for sand/bricks.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {(['all', 'paid', 'dispatched', 'delivered'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition ${
                        statusFilter === st
                          ? 'bg-emerald-600 text-white'
                          : 'bg-industrial-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {st === 'all' ? 'All Orders' : st}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-400 text-sm">
                  Loading live dispatch queue...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-industrial-800 bg-industrial-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <th className="py-3.5 px-5">Order Ref</th>
                        <th className="py-3.5 px-5">Contractor / Customer</th>
                        <th className="py-3.5 px-5">Materials & Tipper Allocation</th>
                        <th className="py-3.5 px-5">Site Destination (PostGIS)</th>
                        <th className="py-3.5 px-5">Gross / Net Payout</th>
                        <th className="py-3.5 px-5">Status</th>
                        <th className="py-3.5 px-5 text-right">Dispatch Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-industrial-800/60 text-sm">
                      {filteredOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="hover:bg-industrial-800/40 transition-colors"
                        >
                          <td className="py-4 px-5 font-mono font-bold text-emerald-400 whitespace-nowrap">
                            {order.order_ref}
                          </td>
                          <td className="py-4 px-5">
                            <div className="font-semibold text-white">{order.customer_name}</div>
                            <div className="text-xs text-slate-400 font-mono">
                              {order.customer_phone}
                            </div>
                          </td>
                          <td className="py-4 px-5">
                            <div className="font-medium text-slate-200">
                              {order.materials_breakdown ||
                                order.items
                                  .map((i) => `${i.quantity}${i.unit} ${i.product_name}`)
                                  .join(', ')}
                            </div>
                          </td>
                          <td className="py-4 px-5 max-w-xs">
                            <div className="text-slate-200 truncate">{order.delivery_address}</div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {order.distance_km} km from yard • Road Freight: R{' '}
                              {order.delivery_fee.toFixed(2)}
                            </div>
                          </td>
                          <td className="py-4 px-5 whitespace-nowrap">
                            <div className="font-bold text-emerald-400">
                              Net: R {order.vendor_payout.toFixed(2)}
                            </div>
                            <div className="text-xs text-slate-400">
                              Gross: R {order.total_amount.toFixed(2)}
                            </div>
                          </td>
                          <td className="py-4 px-5 whitespace-nowrap">
                            {order.current_status === 'paid' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                PAID • READY
                              </span>
                            )}
                            {order.current_status === 'dispatched' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                <Truck className="w-3.5 h-3.5" />
                                DISPATCHED
                              </span>
                            )}
                            {order.current_status === 'delivered' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                DELIVERED
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {order.current_status !== 'delivered' && (
                                <button
                                  onClick={() => handleSendCustomerEtaPing(order)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition inline-flex items-center gap-1"
                                >
                                  <Send className="w-3 h-3" />
                                  ETA Ping
                                </button>
                              )}
                              {order.current_status === 'paid' && (
                                <button
                                  onClick={() => updateStatus(order.id, 'dispatched')}
                                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow"
                                >
                                  🚚 Mark Dispatched
                                </button>
                              )}
                              {order.current_status === 'dispatched' && (
                                <button
                                  onClick={() => updateStatus(order.id, 'delivered')}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow"
                                >
                                  ✅ Mark Delivered
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  const fullOrder =
                                    MOCK_ORDERS_LIST.find((o) => o.id === order.id) ||
                                    MOCK_ORDERS_LIST[0];
                                  setSelectedWaybillOrder({
                                    ...fullOrder,
                                    order_ref: order.order_ref,
                                    customer_name: order.customer_name,
                                    customer_phone: order.customer_phone,
                                    delivery_address: order.delivery_address,
                                    distance_km: order.distance_km,
                                    total_amount: order.total_amount,
                                    vendor_payout: order.vendor_payout,
                                    current_status: order.current_status,
                                  });
                                  setIsWaybillOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-slate-200 text-xs font-medium border border-industrial-700 transition"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                Slip
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Service Business Appointment Slot Engine & 10-Min Hold Monitor */}
            <div className="bg-industrial-900 border border-industrial-800 rounded-xl overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-industrial-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-sky-400" />
                    Service &amp; Appointment Slot Engine (`appointments` • 10-Min Temporary Hold Monitor)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    For `service_booking` tenants (Salons, Wellness, Trade Services): Bypasses PostGIS haulage (`delivery_fee = R0.00`), holds slots for 10 mins during PayFast checkout, and sends automated WhatsApp reminders.
                  </p>
                </div>
                <span className="text-xs font-mono px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300">
                  {appointments.length} Active Slots
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-industrial-800 bg-industrial-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-5">Slot Window</th>
                      <th className="py-3 px-5">Client &amp; WhatsApp</th>
                      <th className="py-3 px-5">Service Booked</th>
                      <th className="py-3 px-5">Fee &amp; Delivery</th>
                      <th className="py-3 px-5">Slot Status</th>
                      <th className="py-3 px-5 text-right">Booking &amp; Reminder Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-industrial-800/60 text-sm">
                    {appointments.map((appt) => (
                      <tr key={appt.id} className="hover:bg-industrial-800/40">
                        <td className="py-3.5 px-5 font-mono text-xs text-sky-300 whitespace-nowrap">
                          {new Date(appt.scheduled_start).toLocaleTimeString('en-ZA', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          –{' '}
                          {new Date(appt.scheduled_end).toLocaleTimeString('en-ZA', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="font-semibold text-white">{appt.customer_name}</div>
                          <div className="text-xs text-slate-400 font-mono">{appt.customer_phone}</div>
                        </td>
                        <td className="py-3.5 px-5 text-slate-200 font-medium">{appt.service_title}</td>
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="font-bold text-emerald-400">R {appt.unit_price.toFixed(2)}</div>
                          <div className="text-[11px] text-slate-400">Delivery Fee: R 0.00</div>
                        </td>
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          {appt.status === 'hold' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              ⏳ 10-MIN HOLD
                            </span>
                          )}
                          {appt.status === 'confirmed' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              ✅ CONFIRMED ({appt.payfast_pf_payment_id})
                            </span>
                          )}
                          {appt.status === 'completed' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                              🎉 COMPLETED
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {appt.status === 'hold' && (
                              <button
                                onClick={() => handleAppointmentAction(appt.id, 'confirm')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                              >
                                Confirm Hold (ITN)
                              </button>
                            )}
                            <button
                              onClick={() => handleAppointmentAction(appt.id, 'remind')}
                              className="px-2.5 py-1.5 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-slate-200 text-xs font-medium border border-industrial-700 transition inline-flex items-center gap-1"
                            >
                              <PhoneCall className="w-3 h-3 text-sky-400" />
                              1h Reminder
                            </button>
                            {appt.status === 'confirmed' && (
                              <button
                                onClick={() => handleAppointmentAction(appt.id, 'complete')}
                                className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition"
                              >
                                Complete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ============================================================
            WORKSPACE 2: MoR REVENUE, FEE ARBITRAGE & ESCROW SET-OFF
           ============================================================ */}
        {activeTab === 'revenue' && (
          <div className="space-y-8">
            {/* Subscription Tier Selector Cards */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Coins className="w-5 h-5 text-amber-400" />
                    Multi-Tenant SaaS Tier & PayFast MoR Interchange Arbitrage
                  </h2>
                  <p className="text-xs text-slate-400">
                    All transactions clear through the master PayFast Merchant-of-Record account
                    (Wholesale Actual Cost: <span className="text-emerald-400 font-semibold">2.0% + R1.50</span>).
                    Select a tier to simulate live settlement & spread retention.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {(['starter', 'pro', 'enterprise'] as VendorSubscriptionTier[]).map((tierKey) => {
                  const t = TIER_CONFIGS[tierKey];
                  const isSelected = selectedTier === tierKey;
                  return (
                    <div
                      key={tierKey}
                      onClick={() => {
                        setSelectedTier(tierKey);
                        showToast(`Switched MoR Revenue Engine preset to ${t.label} (R${t.monthlyFee}/mo)`);
                      }}
                      className={`rounded-xl p-5 border cursor-pointer transition relative ${
                        isSelected
                          ? 'bg-industrial-900 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xl'
                          : 'bg-industrial-900/60 border-industrial-800 hover:border-industrial-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                          {t.label}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                            <Check className="w-3 h-3" /> Active Tier
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold text-white">R{t.monthlyFee}</span>
                        <span className="text-xs text-slate-400">/ month (Auto Ledger Set-Off)</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">{t.tagline}</p>

                      <div className="mt-4 pt-4 border-t border-industrial-800 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Platform Commission:</span>
                          <span className="font-bold text-white">
                            {(t.commissionRate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Billed Processing Rate:</span>
                          <span className="font-bold text-amber-300">
                            {(t.billedPct * 100).toFixed(1)}% + R{t.billedFixed.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Wholesale PayFast Cost:</span>
                          <span className="font-mono text-slate-300">2.0% + R1.50</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Retained Gateway Spread:</span>
                          <span className="font-bold text-emerald-400">
                            +{((t.billedPct - t.actualPct) * 100).toFixed(1)}% + R
                            {(t.billedFixed - t.actualFixed).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Interactive Order Settlement & Zero-Leakage Simulator */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-industrial-900 border border-industrial-800 rounded-xl p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">
                    Live Order Settlement & Arbitrage Simulator
                  </h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Material Order Subtotal (ZAR)
                    </label>
                    <input
                      type="number"
                      value={simSubtotal}
                      onChange={(e) => setSimSubtotal(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded-lg bg-industrial-950 border border-industrial-700 px-3.5 py-2.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      PostGIS Road Haulage & Tipper Fee (ZAR)
                    </label>
                    <input
                      type="number"
                      value={simHaulage}
                      onChange={(e) => setSimHaulage(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded-lg bg-industrial-950 border border-industrial-700 px-3.5 py-2.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="pt-2 border-t border-industrial-800 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-slate-400">
                      Gross Customer Payment:
                    </span>
                    <span className="text-xl font-extrabold text-white font-mono">
                      R {settlementPreview.gross_amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5-Component Settlement Breakdown Output */}
              <div className="lg:col-span-7 bg-industrial-900 border border-industrial-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      5-Component MoR Settlement Isolation
                    </h3>
                    <p className="text-xs text-slate-400">
                      Zero-Leakage Identity: Net Vendor + Commission + Gateway Spread + Wholesale
                      Cost = Gross
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
                    <ShieldCheck className="w-4 h-4" /> Balanced to R0.00
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                  <div className="p-3.5 rounded-lg bg-industrial-950 border border-industrial-800">
                    <div className="text-[11px] text-slate-400 uppercase font-semibold">
                      1. Gross Escrow In
                    </div>
                    <div className="text-lg font-bold text-white font-mono mt-1">
                      +R {settlementPreview.gross_amount.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      customer_payment_received
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-industrial-950 border border-industrial-800">
                    <div className="text-[11px] text-slate-400 uppercase font-semibold">
                      2. Take-Rate Commission
                    </div>
                    <div className="text-lg font-bold text-amber-400 font-mono mt-1">
                      +R {settlementPreview.platform_commission.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      platform_commission_earned
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-industrial-950 border border-emerald-500/30">
                    <div className="text-[11px] text-emerald-300 uppercase font-semibold">
                      3. Gateway Spread Profit
                    </div>
                    <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
                      +R {settlementPreview.gateway_margin_spread.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">payment_spread_retained</div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-industrial-950 border border-industrial-800">
                    <div className="text-[11px] text-slate-400 uppercase font-semibold">
                      4. PayFast Wholesale Cost
                    </div>
                    <div className="text-lg font-bold text-rose-400 font-mono mt-1">
                      -R {settlementPreview.payment_fee_actual.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">gateway_fee_disbursed</div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-industrial-950 border border-sky-500/30">
                    <div className="text-[11px] text-sky-300 uppercase font-semibold">
                      5. Net Vendor Payout
                    </div>
                    <div className="text-lg font-bold text-sky-400 font-mono mt-1">
                      +R {settlementPreview.net_vendor_payout.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      vendor_payout_disbursed ({settlementPreview.vendorRetentionPct}%)
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-gradient-to-br from-emerald-950/60 to-industrial-950 border border-emerald-500/50">
                    <div className="text-[11px] text-emerald-300 uppercase font-bold">
                      Total Platform Yield
                    </div>
                    <div className="text-lg font-extrabold text-emerald-400 font-mono mt-1">
                      R {settlementPreview.total_platform_yield.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-emerald-300/80 mt-0.5">
                      Comm + Spread ({settlementPreview.platformYieldPct}%)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Double-Entry Escrow Ledger Table & Automated SaaS Subscription Set-Off */}
            <div className="bg-industrial-900 border border-industrial-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-industrial-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-emerald-400" />
                    Double-Entry Escrow Ledger (`ledger_entries`) & Monthly SaaS Set-Off
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                     Platform Commission Earned: <span className="text-amber-300 font-mono font-semibold">R {totalPlatformCommEarned.toFixed(2)}</span> •
                    Gateway Spread Retained: <span className="text-emerald-400 font-mono font-semibold">R {totalPlatformSpreadRetained.toFixed(2)}</span> •
                    Unsettled Vendor Escrow: <span className="text-sky-300 font-mono font-semibold">R {currentEscrowBalance.toFixed(2)}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleApplySubscriptionSetoff}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition shadow flex items-center gap-2"
                  >
                    <Coins className="w-4 h-4" />
                    Apply Monthly SaaS Set-Off (-R{TIER_CONFIGS[selectedTier].monthlyFee}.00)
                  </button>

                  <button
                    onClick={() => handleExportBankCsv()}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download {selectedBankFormat.toUpperCase()} Batch
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-industrial-800 bg-industrial-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-5">Order / Cycle Ref</th>
                      <th className="py-3 px-5">Ledger Entry Type (`ledger_entry_type`)</th>
                      <th className="py-3 px-5">Reference / Arbitrage Note</th>
                      <th className="py-3 px-5 text-right">Debit (ZAR)</th>
                      <th className="py-3 px-5 text-right">Credit (ZAR)</th>
                      <th className="py-3 px-5 text-right">Escrow Balance After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-industrial-800/60 text-xs font-mono">
                    {ledgerEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-industrial-800/30">
                        <td className="py-3 px-5 font-bold text-slate-200">
                          {entry.order_ref || entry.order_id}
                        </td>
                        <td className="py-3 px-5">
                          <span
                            className={`px-2 py-0.5 rounded font-semibold ${
                              entry.entry_type === 'customer_payment_received'
                                ? 'bg-slate-800 text-white'
                                : entry.entry_type === 'platform_commission_earned'
                                ? 'bg-amber-500/15 text-amber-300'
                                : entry.entry_type === 'payment_spread_retained'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : entry.entry_type === 'gateway_fee_disbursed'
                                ? 'bg-rose-500/15 text-rose-300'
                                : entry.entry_type === 'saas_subscription_setoff'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                : 'bg-sky-500/15 text-sky-300'
                            }`}
                          >
                            {entry.entry_type}
                          </span>
                        </td>
                        <td className="py-3 px-5 font-sans text-slate-300">
                          {entry.reference || 'Automated PayFast ITN Split'}
                        </td>
                        <td className="py-3 px-5 text-right text-rose-300">
                          {entry.debit > 0 ? `-R ${entry.debit.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-5 text-right text-emerald-400">
                          {entry.credit > 0 ? `+R ${entry.credit.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-5 text-right font-bold text-white">
                          R {entry.balance_after.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            WORKSPACE 3: WHATSAPP CATALOG, SHARP 1024x1024 & PRE-PUBLISH GATE
           ============================================================ */}
        {activeTab === 'catalog' && (
          <div className="space-y-6">
            {/* Inbound Vendor Media Upload & Pre-Publish Approval Gate Simulator */}
            <div className="bg-industrial-900 border border-sky-500/30 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-sky-400" />
                    Vendor Self-Service Media Upload, Sharp 1024x1024 Normalization &amp; Pre-Publish Approval Gate
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Inbound vendor photos (`type === &apos;image&apos;`) trigger `PROCESS_CATALOG_INGESTION`: stores `raw_image_url`, normalizes onto a 1024x1024 `#F8F9FA` canvas (`enhanced_image_url`), sets `is_available = FALSE` &amp; `meta_product_retailer_id = NULL`, and awaits interactive WhatsApp approval.
                  </p>
                </div>

                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                  {draftProductsCount} Pre-Publish Draft(s) Pending Approval
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-industrial-800">
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-lg transition whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  📸 Upload &amp; AI-Enhance Photo On-The-Spot (1024×1024 Studio)
                </button>
                <input
                  type="text"
                  value={simUploadCaption}
                  onChange={(e) => setSimUploadCaption(e.target.value)}
                  placeholder="Or enter vendor WhatsApp image caption (e.g. '19mm Concrete Stone R640 per m3')"
                  className="flex-1 rounded-lg bg-industrial-950 border border-industrial-700 px-3.5 py-2 text-xs text-white font-mono focus:border-sky-400 focus:outline-none"
                />
                <button
                  onClick={handleSimulateWhatsAppImageUpload}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition whitespace-nowrap"
                >
                  <PlusCircle className="w-4 h-4" />
                  Simulate WhatsApp Caption Upload
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {products.map((prod) => {
                const isDraft = !prod.meta_retailer_id;
                const isEditingThis = editingPriceProductId === prod.id;

                return (
                  <div
                    key={prod.id}
                    className={`bg-industrial-900 border rounded-xl overflow-hidden flex flex-col justify-between ${
                      isDraft ? 'border-amber-500/60 ring-1 ring-amber-500/20' : 'border-industrial-800'
                    }`}
                  >
                    <div>
                      <div className="h-44 bg-industrial-950 relative overflow-hidden">
                        <img
                          src={prod.image_url}
                          alt={prod.title}
                          className="w-full h-full object-cover opacity-85"
                        />
                        <span className="absolute top-3 left-3 bg-industrial-950/90 border border-industrial-700 text-[11px] font-mono font-bold px-2.5 py-1 rounded text-slate-200">
                          {prod.meta_retailer_id || 'DRAFT (meta_product_retailer_id = NULL)'}
                        </span>
                        <span
                          className={`absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                            isDraft
                              ? 'bg-amber-500 text-slate-950'
                              : prod.is_available
                              ? 'bg-emerald-500/90 text-slate-950'
                              : 'bg-rose-500/90 text-white'
                          }`}
                        >
                          {isDraft ? 'AWAITING APPROVAL' : prod.is_available ? 'LIVE IN CATALOG' : 'OUT OF STOCK'}
                        </span>
                        <span className="absolute bottom-2 right-2 bg-industrial-950/90 text-[10px] font-mono text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                          1024x1024 #F8F9FA WebP
                        </span>
                      </div>

                      <div className="p-5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                          {prod.category.replace('_', ' & ')} • {prod.unit_of_measure}
                        </div>
                        <h3 className="text-base font-bold text-white mt-1">{prod.title}</h3>
                        <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">
                          {prod.description}
                        </p>

                        {isEditingThis && (
                          <div className="mt-3 p-3 rounded-lg bg-industrial-950 border border-amber-500/40 space-y-2">
                            <div className="text-[11px] font-bold text-amber-300">
                              WAITING_FOR_PRICE_EDIT — Reply with price &amp; unit:
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={priceEditInput}
                                onChange={(e) => setPriceEditInput(e.target.value)}
                                placeholder="e.g. R620 per m3"
                                className="flex-1 rounded bg-industrial-900 border border-industrial-700 px-2.5 py-1 text-xs text-white font-mono"
                              />
                              <button
                                onClick={() => handleApplyPriceEdit(prod.id)}
                                className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 text-xs font-bold"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-5 py-3.5 border-t border-industrial-800 bg-industrial-950/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-slate-400">Unit Price:</span>
                          <div className="text-lg font-extrabold text-emerald-400 font-mono">
                            R {prod.unit_price.toFixed(2)}{' '}
                            <span className="text-xs font-normal text-slate-400">
                              {prod.unit_of_measure}
                            </span>
                          </div>
                        </div>

                        {!isDraft && (
                          <button
                            onClick={() => {
                              setProducts((prev) =>
                                prev.map((p) =>
                                  p.id === prod.id ? { ...p, is_available: !p.is_available } : p
                                )
                              );
                              showToast(
                                `Updated "${prod.title}" availability in Meta WhatsApp Catalog`
                              );
                            }}
                            className="px-3 py-1.5 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-xs font-semibold text-slate-200 border border-industrial-700 transition"
                          >
                            Toggle Stock
                          </button>
                        )}
                      </div>

                      {isDraft && (
                        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-industrial-800/80">
                          <button
                            onClick={() => handlePublishDraft(prod.id)}
                            className="px-2 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition flex items-center justify-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setEditingPriceProductId(prod.id);
                              setPriceEditInput(`R${prod.unit_price} ${prod.unit_of_measure}`);
                            }}
                            className="px-2 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition flex items-center justify-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            Edit Price
                          </button>
                          <button
                            onClick={() => handleDiscardDraft(prod.id)}
                            className="px-2 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-bold transition flex items-center justify-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Discard
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================
            WORKSPACE 4: CLOUD VIRTUAL NUMBERS, ZERO-DATA & GEMINI FLASH
           ============================================================ */}
        {activeTab === 'ai_bridge' && (
          <div className="space-y-6">
            {/* Cloud Virtual WhatsApp Numbers & Zero-Data Protocol Panel */}
            <div className="bg-industrial-900 border border-emerald-500/30 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-lg font-bold text-white">
                      Server-Hosted Cloud Virtual WhatsApp Numbers & Zero-Data Protocol
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Hosted 24/7 on Meta Cloud API + Railway Server. Suppliers and drivers{' '}
                    <strong className="text-emerald-300">
                      never need a physical SIM card or mobile data package
                    </strong>{' '}
                    to keep their WhatsApp store online or update dispatches.
                  </p>
                </div>

                <span className="px-3 py-1 rounded-full text-xs font-bold border bg-emerald-500/15 border-emerald-500/40 text-emerald-300">
                  ● CLOUD VIRTUAL NUMBER ONLINE 24/7 (ZERO DATA NEEDED)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-industrial-950 border border-industrial-800">
                  <div className="text-[11px] uppercase font-semibold text-slate-400">
                    Dedicated Vendor Virtual Number (Master WABA)
                  </div>
                  <div className="text-base font-bold text-emerald-400 font-mono mt-1">
                    +27 60 010 4001 (Dedicated Line)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Master WABA: <span className="text-slate-300 font-mono">waba_master_cargodash_001</span> • Phone ID: <span className="text-emerald-300 font-mono">meta_pnum_brickdirect_101</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-industrial-950 border border-industrial-800">
                  <div className="text-[11px] uppercase font-semibold text-slate-400">
                    100% Isolated Vendor Catalog & Sub-Ledger
                  </div>
                  <div className="text-base font-bold text-white mt-1 font-mono">
                    cat_brickdirect_001
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Zero cross-tenant mixing • No switching between apps or platforms
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-industrial-950 border border-industrial-800">
                  <div className="text-[11px] uppercase font-semibold text-slate-400">
                    Zero-Data Driver & Onboarding Protocol
                  </div>
                  <div className="text-base font-bold text-sky-400 font-mono mt-1">
                    &lt; 0.3 KB Plain WhatsApp Text
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Onboard, upload catalog, set service hours &amp; dispatch 100% inside WhatsApp
                  </div>
                </div>
              </div>

              {/* Quick Zero-Data WhatsApp Command Simulator */}
              <div className="pt-3 border-t border-industrial-800">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
                  Simulate Zero-Data In-WhatsApp Supplier, Service Booking &amp; Onboarding Commands:
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { cmd: 'STATUS', label: '📡 Send "STATUS" (Check Escrow & Queue)' },
                    { cmd: 'LOAD ORD-2026-8921', label: '🚚 Send "LOAD ORD-2026-8921"' },
                    { cmd: 'DONE ORD-2026-8921', label: '✅ Send "DONE ORD-2026-8921" (POD)' },
                    { cmd: 'PRICE SAND R580', label: '💰 Send "PRICE SAND R580"' },
                    { cmd: 'STOCK OFF CEMENT', label: '📦 Send "STOCK OFF CEMENT"' },
                    {
                      cmd: 'ADD Plaster Sand 6m³ | R3250 | per 6m3 load',
                      label: '✨ Send "ADD Plaster Sand 6m³ | R3250"',
                    },
                    {
                      cmd: 'HOURS MON-SAT 08:00-17:00 60M',
                      label: '🗓️ Send "HOURS MON-SAT 08:00-17:00 60M" (Service Slots)',
                    },
                    {
                      cmd: 'ONBOARD Aura Luxe Salon | service_booking | pro | Capitec 1544332211',
                      label: '🚀 Send "ONBOARD Aura Luxe Salon | service_booking"',
                    },
                  ].map((item) => (
                    <button
                      key={item.cmd}
                      onClick={() => {
                        if (item.cmd.startsWith('LOAD')) {
                          updateStatus('ord_8921_uuid', 'dispatched');
                        } else if (item.cmd.startsWith('DONE')) {
                          updateStatus('ord_8921_uuid', 'delivered');
                        } else if (item.cmd.startsWith('ADD ')) {
                          handleAddGeneratedProduct({
                            title: 'Plaster Sand (6m³ Tipper Load)',
                            category: 'Aggregates & Sand',
                            unit_of_measure: 'per 6m³ load',
                            unit_price: 3250,
                            meta_retailer_id: `SKU-WA-${Date.now().toString().slice(-4)}`,
                          });
                        } else {
                          showToast(
                            `📲 Zero-Data WhatsApp Command "${item.cmd}" executed (<0.3 KB payload)`
                          );
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-industrial-800 hover:bg-emerald-600/20 hover:border-emerald-500/40 text-slate-200 text-xs font-mono border border-industrial-700 transition"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Antigravity Gemini Flash Configuration Bar */}
            <div className="bg-industrial-900 border border-purple-500/30 rounded-xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-bold text-white">
                      Antigravity Gemini Flash Multi-Tenant Operations & Revenue Studio
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Powered exclusively by <strong className="text-purple-300">Gemini Flash</strong>{' '}
                    and the deterministic Cargo-Dash MoR Engine (OpenAI completely removed for zero
                    production token overhead).
                  </p>
                </div>

                <span className="px-3 py-1 rounded-full text-xs font-bold border bg-purple-500/15 border-purple-500/40 text-purple-300">
                  Antigravity + Gemini Flash Active
                </span>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    value={openAiKeyInput}
                    onChange={(e) => setOpenAiKeyInput(e.target.value)}
                    placeholder="Optional: Paste Google GEMINI_API_KEY (AIza...) to override server .env"
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-industrial-950 border border-industrial-700 text-xs text-white font-mono focus:border-purple-400 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleSaveApiKey}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition whitespace-nowrap"
                >
                  Save Gemini Key
                </button>
              </div>
            </div>

            {/* 4 Gemini Flash Mode Selector Pills & Prompt Box */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-industrial-900 border border-industrial-800 rounded-xl p-6 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  Select Gemini Flash Analysis Mode
                </h3>

                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    {
                      id: 'REVENUE_ARBITRAGE_ADVISOR',
                      title: '1. MoR Revenue & Tier Arbitrage Advisor',
                      desc: 'Compare Starter/Pro/Enterprise net payouts & PayFast spread',
                      defaultPrompt:
                        'Analyze my R411k monthly GMV across 89 orders and recommend the optimal SaaS tier.',
                    },
                    {
                      id: 'DISPATCH_LOAD_OPTIMIZER',
                      title: '2. PostGIS Tipper Dispatch Optimizer',
                      desc: 'Consolidate m³ loads & heavy tipper (>6m³) routing',
                      defaultPrompt:
                        'Optimize tipper truck allocation across today’s active Albertinia & Riversdale orders.',
                    },
                    {
                      id: 'CATALOG_PRODUCT_GENERATOR',
                      title: '3. Gemini Flash Catalog Spec Generator',
                      desc: 'Turn raw supplier price notes into live Catalog SKUs',
                      defaultPrompt: '19mm Crushed Stone Aggregate R645 per cube',
                    },
                    {
                      id: 'UI_COBUILDER_ARCHITECT',
                      title: '4. Antigravity Schema & UI Architect',
                      desc: 'Generate React/Tailwind widgets bound to Cargo-Dash types',
                      defaultPrompt:
                        'Generate a sleek MoR Arbitrage Yield summary card component with Tailwind industrial styling.',
                    },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setBridgeTaskType(mode.id as any);
                        setBridgePrompt(mode.defaultPrompt);
                      }}
                      className={`text-left p-3.5 rounded-lg border transition ${
                        bridgeTaskType === mode.id
                          ? 'bg-purple-500/15 border-purple-500 text-white'
                          : 'bg-industrial-950/70 border-industrial-800 text-slate-300 hover:border-industrial-700'
                      }`}
                    >
                      <div className="text-xs font-bold">{mode.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{mode.desc}</div>
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Gemini Flash Prompt / Specification
                  </label>
                  <textarea
                    rows={3}
                    value={bridgePrompt}
                    onChange={(e) => setBridgePrompt(e.target.value)}
                    className="w-full rounded-lg bg-industrial-950 border border-industrial-700 p-3 text-xs text-white focus:border-purple-400 focus:outline-none"
                  />
                </div>

                <button
                  onClick={() => runOpenAiBridge()}
                  disabled={bridgeLoading}
                  className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white text-xs font-extrabold uppercase tracking-wider transition shadow-lg flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {bridgeLoading
                    ? 'Synthesizing via Gemini Flash...'
                    : 'Execute Gemini Flash Analysis'}
                </button>
              </div>

              {/* Gemini Flash Output Console */}
              <div className="lg:col-span-7 bg-industrial-900 border border-industrial-800 rounded-xl p-6 flex flex-col justify-between">
                {!bridgeResult ? (
                  <div className="my-auto text-center py-12 space-y-3">
                    <Sparkles className="w-10 h-10 text-purple-400 mx-auto opacity-80" />
                    <h3 className="text-base font-bold text-white">
                      Antigravity Gemini Flash Engine Ready
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Click <strong>&ldquo;Execute Gemini Flash Analysis&rdquo;</strong> to run live
                      MoR revenue arbitrage math, generate new catalog SKUs, or synthesize UI
                      components.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-industrial-800 pb-4">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400">
                          {bridgeResult.provider === 'gemini-flash-live'
                            ? `🟢 Live Gemini Flash (${bridgeResult.model})`
                            : `⚡ Antigravity + Gemini Flash Engine (${bridgeResult.model})`}
                        </span>
                        <h3 className="text-base font-bold text-white mt-0.5">
                          {bridgeResult.headline}
                        </h3>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{bridgeResult.summary}</p>

                    {bridgeResult.metrics && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {Object.entries(bridgeResult.metrics).map(([k, v]) => (
                          <div
                            key={k}
                            className="p-3 rounded-lg bg-industrial-950 border border-industrial-800"
                          >
                            <div className="text-[10px] uppercase text-slate-400 font-semibold">
                              {k}
                            </div>
                            <div className="text-sm font-bold text-emerald-400 font-mono mt-1">
                              {String(v)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {Array.isArray(bridgeResult.insights) && bridgeResult.insights.length > 0 && (
                      <div className="space-y-2 bg-industrial-950/70 p-4 rounded-lg border border-industrial-800">
                        <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                          Key Actionable Insights
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-300">
                          {bridgeResult.insights.map((ins: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                              <span>{ins}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {bridgeResult.generatedProduct && (
                      <div className="p-4 rounded-lg bg-sky-950/30 border border-sky-500/40 flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-bold text-sky-300">
                            Ready to Publish: {bridgeResult.generatedProduct.title} (R{' '}
                            {Number(bridgeResult.generatedProduct.unit_price).toFixed(2)})
                          </div>
                          <div className="text-[11px] text-slate-400">
                            SKU: {bridgeResult.generatedProduct.meta_retailer_id} •{' '}
                            {bridgeResult.generatedProduct.unit_of_measure}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddGeneratedProduct(bridgeResult.generatedProduct)}
                          className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold transition"
                        >
                          + Add Generated Product to Catalog
                        </button>
                      </div>
                    )}

                    {bridgeResult.codeArtifact && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                          <Code2 className="w-4 h-4" />
                          Generated Component Artifact
                        </div>
                        <pre className="p-3.5 rounded-lg bg-industrial-950 border border-industrial-800 text-[11px] font-mono text-emerald-300 overflow-x-auto">
                          {bridgeResult.codeArtifact}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Printable Driver Waybill / Kitchen Prep Ticket Modal */}
      {selectedWaybillOrder && (
        <WaybillPreviewModal
          isOpen={isWaybillOpen}
          onClose={() => setIsWaybillOpen(false)}
          order={selectedWaybillOrder}
          vendor={selectedVendor}
        />
      )}

      {/* On-The-Spot AI Photo Enhancer & Live Catalog Loader Modal */}
      <UploadProductModal
        vendor={selectedVendor}
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onProductCreated={(newProd, asDraft) => {
          setProducts((prev) => [newProd, ...prev]);
          setActiveTab('catalog');
          showToast(
            asDraft
              ? `📸 Saved AI-Enhanced 1024×1024 draft "${newProd.title}" to Pre-Publish Approval Gate!`
              : `✅ Published AI-Enhanced 1024×1024 "${newProd.title}" (R${newProd.unit_price.toFixed(2)}) live to ${selectedVendor.business_name}'s WhatsApp Catalog!`
          );
        }}
      />

      {/* Onboard New Customer / Vendor Company Modal (e.g. Higiene) */}
      <AddVendorModal
        isOpen={isAddVendorModalOpen}
        onClose={() => setIsAddVendorModalOpen(false)}
        onVendorCreated={(newVendor, openCatalogUploadImmediately) => {
          setVendorsList((prev) => [newVendor, ...prev]);
          setSelectedVendor(newVendor);
          if (newVendor.subscription_tier) {
            setSelectedTier(newVendor.subscription_tier);
          }
          setActiveTab('catalog');
          showToast(
            `🏢 Onboarded "${newVendor.business_name}" with isolated WhatsApp ${newVendor.whatsapp_number}!`
          );
          if (openCatalogUploadImmediately) {
            setTimeout(() => setIsUploadModalOpen(true), 250);
          }
        }}
      />
    </div>
  );
}
