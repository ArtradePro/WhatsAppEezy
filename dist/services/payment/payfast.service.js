"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.payFastService = exports.PayFastService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../../config/env");
const ledger_service_1 = require("../ledger/ledger.service");
const whatsapp_client_service_1 = require("../whatsapp/whatsapp-client.service");
const accounting_queue_worker_1 = require("../queue/accounting-queue.worker");
const metrics_service_1 = require("../metrics/metrics.service");
const payfast_ledger_transaction_service_1 = require("../ledger/payfast-ledger-transaction.service");
const payfast_events_1 = require("../events/payfast-events");
class PayFastService {
    merchantId;
    merchantKey;
    passphrase;
    isSandbox;
    baseUrl;
    constructor() {
        this.merchantId = env_1.config.PAYFAST_MERCHANT_ID;
        this.merchantKey = env_1.config.PAYFAST_MERCHANT_KEY;
        this.passphrase = env_1.config.PAYFAST_PASSPHRASE;
        this.isSandbox = env_1.config.PAYFAST_ENV === 'sandbox';
        this.baseUrl = this.isSandbox
            ? 'https://sandbox.payfast.co.za'
            : 'https://www.payfast.co.za';
    }
    /**
     * Generates a secure PayFast checkout URL with signed parameters
     */
    generateCheckoutUrl(order) {
        const formattedAmount = order.totalAmount.toFixed(2);
        const isServiceBooking = order.businessType === 'service_booking';
        const itemDescription = isServiceBooking
            ? `Booking ${order.orderId}: ${order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')} (${order.scheduledStart || 'Scheduled Slot'})`
            : `Order ${order.orderId}: ${order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')} + Delivery (${order.freightQuote.distanceKm}km)`;
        const params = {
            merchant_id: this.merchantId,
            merchant_key: this.merchantKey,
            return_url: env_1.config.PAYFAST_RETURN_URL,
            cancel_url: env_1.config.PAYFAST_CANCEL_URL,
            notify_url: env_1.config.PAYFAST_NOTIFY_URL,
            m_payment_id: order.orderId,
            amount: formattedAmount,
            item_name: `WhatsAppEezy: Order #${order.orderId.slice(-6)}`,
            item_description: itemDescription.slice(0, 250),
            custom_str1: order.customerWhatsApp,
            custom_str2: order.vendorWhatsApp,
            custom_str3: order.orderId,
            ...(order.vendorId ? { custom_str4: order.vendorId } : {}),
            ...(order.appointmentId ? { custom_str5: order.appointmentId } : {}),
        };
        // Calculate MD5 signature
        const signature = this.generateSignature(params, this.passphrase);
        params.signature = signature;
        const queryString = new URLSearchParams(params).toString();
        return `${this.baseUrl}/eng/process?${queryString}`;
    }
    /**
     * Generates MD5 signature for PayFast parameter mapping
     */
    generateSignature(data, passphrase, sortKeys = false) {
        let keys = Object.keys(data).filter((k) => k !== 'signature' && data[k] !== undefined && data[k] !== null && String(data[k]).trim() !== '');
        if (sortKeys) {
            keys = keys.sort();
        }
        const pfParamString = keys
            .map((k) => `${k}=${encodeURIComponent(String(data[k]).trim()).replace(/%20/g, '+')}`)
            .join('&');
        let fullString = pfParamString;
        const pass = passphrase !== undefined ? passphrase : this.passphrase;
        if (pass) {
            fullString += `&passphrase=${encodeURIComponent(pass.trim()).replace(/%20/g, '+')}`;
        }
        return crypto_1.default.createHash('md5').update(fullString).digest('hex');
    }
    /**
     * Verifies incoming PayFast ITN webhook payload
     */
    verifySignature(itnPayload, customPassphrase) {
        const incomingSignature = itnPayload.signature;
        if (!incomingSignature)
            return false;
        const pass = customPassphrase !== undefined ? customPassphrase : this.passphrase;
        const expectedSig = String(incomingSignature).trim().toLowerCase();
        // 1. Check preserving exact sequence
        const sigPreserved = this.generateSignature(itnPayload, pass, false).toLowerCase();
        if (sigPreserved === expectedSig)
            return true;
        // 2. Check sorted sequence (as permitted by PayFast documentation)
        const sigSorted = this.generateSignature(itnPayload, pass, true).toLowerCase();
        if (sigSorted === expectedSig)
            return true;
        return false;
    }
    /**
     * Validates IP address against known PayFast ranges
     */
    isValidPayFastIp(ip) {
        if (!ip)
            return true;
        if (ip === '127.0.0.1' ||
            ip === '::1' ||
            ip === 'localhost' ||
            ip.startsWith('10.') ||
            ip.startsWith('192.168.') ||
            env_1.config.NODE_ENV === 'test' ||
            env_1.config.MOCK_EXTERNAL_APIS) {
            return true;
        }
        const cleanIp = ip.replace(/^::ffff:/, '');
        const validRanges = [
            { prefix: '197.97.145.', start: 144, end: 159 },
            { prefix: '41.74.179.', start: 192, end: 207 },
            { prefix: '102.130.40.', start: 160, end: 175 },
            { prefix: '102.220.16.', start: 128, end: 143 },
        ];
        for (const range of validRanges) {
            if (cleanIp.startsWith(range.prefix)) {
                const lastOctet = parseInt(cleanIp.split('.')[3], 10);
                if (!isNaN(lastOctet) && lastOctet >= range.start && lastOctet <= range.end) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Validates ITN with PayFast server via postback query
     */
    async validateServerPostback(itnPayload) {
        if (env_1.config.NODE_ENV === 'test' || env_1.config.MOCK_EXTERNAL_APIS)
            return true;
        try {
            const validateUrl = this.isSandbox
                ? 'https://sandbox.payfast.co.za/eng/query/validate'
                : 'https://payment.payfast.co.za/eng/query/validate';
            const postData = new URLSearchParams();
            for (const key of Object.keys(itnPayload)) {
                if (itnPayload[key] !== undefined && itnPayload[key] !== null) {
                    postData.append(key, String(itnPayload[key]));
                }
            }
            const response = await axios_1.default.post(validateUrl, postData.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000,
            });
            return response.data === 'VALID';
        }
        catch (err) {
            console.error('PayFast postback validation error:', err.message || err);
            return false;
        }
    }
    /**
     * Processes verified ITN, computes ledger split, and dispatches WhatsApp confirmations
     */
    async processPaymentNotification(itnPayload) {
        const grossAmount = parseFloat(itnPayload.amount_gross);
        const payfastFee = parseFloat(itnPayload.amount_fee || '0');
        const commissionPct = env_1.config.PLATFORM_COMMISSION_PERCENTAGE; // e.g. 8%
        const platformCommissionAmount = Math.round(grossAmount * (commissionPct / 100) * 100) / 100;
        const vendorPayoutNet = Math.round((grossAmount - platformCommissionAmount - payfastFee) * 100) / 100;
        const orderId = itnPayload.custom_str3 || itnPayload.m_payment_id;
        const customerWhatsApp = itnPayload.custom_str1 || '';
        const vendorWhatsApp = itnPayload.custom_str2 || env_1.config.VENDOR_DEFAULT_WHATSAPP_NUMBER;
        // 1. Record split in ledger
        const ledgerEntry = await ledger_service_1.ledgerService.recordPaymentSplit({
            orderId,
            mPaymentId: itnPayload.m_payment_id,
            pfPaymentId: itnPayload.pf_payment_id,
            grossAmount,
            payfastFee,
            platformCommissionPercentage: commissionPct,
            platformCommissionAmount,
            vendorPayoutNet,
            currency: env_1.config.DEFAULT_CURRENCY,
            customerWhatsApp,
            vendorWhatsApp,
            status: 'SETTLED',
        });
        // 2. Execute Atomic SQL Double-Entry Ledger Transaction
        const txResult = await payfast_ledger_transaction_service_1.payFastLedgerTransactionService.processITNTransaction(itnPayload);
        // 2b. Automatically queue BullMQ job to sync with Xero & Sage One
        const finalCustomerPhone = txResult.order?.customer_phone || customerWhatsApp;
        const finalVendorPhone = txResult.vendor?.whatsapp_number || vendorWhatsApp;
        await accounting_queue_worker_1.accountingQueueWorker.publishOrderPaid({
            orderId,
            tenantId: txResult.vendor?.id || 'tenant_brickdirect',
            customerWhatsApp: finalCustomerPhone,
            customerName: txResult.order?.customer_name || 'Customer',
            grossAmount,
            materialsSubtotal: txResult.order?.subtotal || Math.round(grossAmount * 0.75 * 100) / 100,
            freightAmount: txResult.order?.delivery_fee || Math.round((grossAmount - (txResult.order?.subtotal || 0)) * 100) / 100,
            currency: env_1.config.DEFAULT_CURRENCY,
            payfastFee,
            commissionPercentage: commissionPct,
            timestamp: new Date().toISOString(),
        });
        // 3. Emit Typed Order Paid Event
        if (txResult.order) {
            payfast_events_1.payFastEventEmitter.emitOrderPaid({
                order: txResult.order,
                vendor: txResult.vendor || null,
                entries: txResult.entries || [],
                pfPaymentId: itnPayload.pf_payment_id,
                grossAmount,
                timestamp: new Date().toISOString(),
            });
        }
        // 4. Record Paid Order in Live Metrics Engine
        const materialsEst = Math.round(grossAmount * 0.75 * 100) / 100;
        const freightEst = Math.round((grossAmount - materialsEst) * 100) / 100;
        metrics_service_1.metricsService.recordPaidOrder({
            orderId,
            tenantId: 'tenant_brickdirect',
            grossAmount,
            freightAmount: freightEst,
            commissionAmount: platformCommissionAmount,
        });
        // 5. Dispatch Customer & Vendor WhatsApp Confirmation (Split: Service Booking vs Physical Freight)
        const isServiceVendor = txResult.vendor?.business_type === 'service_booking' || Boolean(txResult.confirmedAppointment);
        if (isServiceVendor) {
            const slotStart = txResult.confirmedAppointment?.scheduled_start || 'Scheduled Slot';
            if (finalCustomerPhone) {
                const customerMsg = `✅ *Appointment Confirmed! #${orderId.slice(-6)}*\n\nThank you for booking with *${txResult.vendor?.business_name || 'Our Studio'}*! Your deposit/payment of *${env_1.config.DEFAULT_CURRENCY} ${grossAmount.toFixed(2)}* has been settled via PayFast.\n\n📅 *Confirmed Slot*: ${slotStart}\n🚚 *Delivery Fee*: R 0.00 (In-Studio Service)\n\nTransaction ID: \`${itnPayload.pf_payment_id}\``;
                await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(finalCustomerPhone, customerMsg);
            }
            if (finalVendorPhone) {
                const vendorMsg = `📅 *New Confirmed Appointment! #${orderId.slice(-6)}*\n\n👤 *Client*: ${txResult.order?.customer_name || 'Client'} (+${finalCustomerPhone})\n⏰ *Slot*: ${slotStart}\n💰 *Net Vendor Payout*: ${env_1.config.DEFAULT_CURRENCY} ${vendorPayoutNet.toFixed(2)}\n\nSlot status has been upgraded from HOLD -> CONFIRMED.`;
                await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(finalVendorPhone, vendorMsg);
            }
        }
        else {
            if (finalCustomerPhone) {
                const customerMsg = `✅ *Payment Confirmed! Order #${orderId.slice(-6)}*\n\nThank you for your order! Your payment of *${env_1.config.DEFAULT_CURRENCY} ${grossAmount.toFixed(2)}* has been received via PayFast.\n\n📦 *Status*: Processing for dispatch.\n🚚 Heavy vehicle mobilization has been scheduled with the supplier warehouse.\n\nTransaction ID: \`${itnPayload.pf_payment_id}\``;
                await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(finalCustomerPhone, customerMsg);
            }
            if (finalVendorPhone) {
                await whatsapp_client_service_1.whatsAppClientService.sendVendorDispatchNotification(finalVendorPhone, orderId, {
                    customerName: txResult.order?.customer_name || 'Customer',
                    customerPhone: finalCustomerPhone ? `+${finalCustomerPhone}` : '082 123 4567',
                    siteAddress: txResult.order?.delivery_address || 'Stand 402, Albertinia Industrial',
                    itemsToLoad: '• Building Materials & Heavy Tipper Dispatch',
                    netPayoutFormatted: `${env_1.config.DEFAULT_CURRENCY} ${vendorPayoutNet.toFixed(2)}`,
                    commissionRatePct: commissionPct,
                });
            }
        }
        // 6. Trigger Background Accounting Reconciliation (BullMQ / Redis)
        await accounting_queue_worker_1.accountingQueueWorker.publishOrderPaid({
            orderId,
            tenantId: txResult.vendor?.id || 'tenant_brickdirect',
            customerWhatsApp,
            customerName: 'WhatsApp Customer',
            grossAmount,
            materialsSubtotal: materialsEst,
            freightAmount: isServiceVendor ? 0 : freightEst,
            currency: env_1.config.DEFAULT_CURRENCY,
            payfastFee,
            commissionPercentage: commissionPct,
            timestamp: new Date().toISOString(),
        });
        return ledgerEntry;
    }
}
exports.PayFastService = PayFastService;
exports.payFastService = new PayFastService();
//# sourceMappingURL=payfast.service.js.map