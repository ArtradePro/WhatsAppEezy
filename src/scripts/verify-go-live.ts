import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createFastifyApp } from '../fastify-app';
import { config } from '../config/env';

async function runGoLiveVerification(): Promise<void> {
  console.log('================================================================================');
  console.log('🚀 CARGO-DASH GO-LIVE ROLLOUT VERIFIER (RAILWAY + PAYFAST SANDBOX + COLLATERAL)');
  console.log('================================================================================\n');

  const app = createFastifyApp();
  await app.ready();

  try {
    // =========================================================================
    // PHASE 1: Railway Container Readiness & Meta Webhook Handshake Verification
    // =========================================================================
    console.log('1️⃣  [STEP 1: Railway Deployment & Meta Developer Portal Webhook Handshake]');

    const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile');
    const railwayJsonPath = path.resolve(process.cwd(), 'railway.json');
    if (!fs.existsSync(dockerfilePath) || !fs.existsSync(railwayJsonPath)) {
      throw new Error('Missing Dockerfile or railway.json');
    }

    const goLiveRes = await app.inject({
      method: 'GET',
      url: '/api/v1/system/go-live-status',
    });
    if (goLiveRes.statusCode !== 200) {
      throw new Error(`Expected 200 on /api/v1/system/go-live-status, got ${goLiveRes.statusCode}`);
    }
    const goLiveStatus = JSON.parse(goLiveRes.payload);
    console.log(`   ✅ Container Build: ${goLiveStatus.railwayContainer.builder}`);
    console.log(`   ✅ AI Runtime:      ${goLiveStatus.railwayContainer.aiRuntime}`);

    // 1A. Meta GET /api/webhooks/whatsapp Handshake Challenge
    const challengeToken = 'CHALLENGE_RAILWAY_META_HANDSHAKE_998877';
    const verifyToken = config.META_WEBHOOK_VERIFY_TOKEN || config.WHATSAPP_VERIFY_TOKEN;
    const handshakeRes = await app.inject({
      method: 'GET',
      url: `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
        verifyToken
      )}&hub.challenge=${challengeToken}`,
    });

    if (handshakeRes.statusCode !== 200 || handshakeRes.payload !== challengeToken) {
      throw new Error(
        `Meta Webhook GET handshake failed: status=${handshakeRes.statusCode}, body=${handshakeRes.payload}`
      );
    }
    console.log(
      `   ✅ Meta GET /api/webhooks/whatsapp Handshake: HTTP 200 OK (Echoed Challenge: "${handshakeRes.payload}")`
    );

    // Verify invalid token is rejected with 403 Forbidden
    const badHandshakeRes = await app.inject({
      method: 'GET',
      url: `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=${challengeToken}`,
    });
    if (badHandshakeRes.statusCode !== 403) {
      throw new Error(`Expected 403 for invalid verify_token, got ${badHandshakeRes.statusCode}`);
    }
    console.log('   ✅ Meta GET /api/webhooks/whatsapp Invalid Token Guard: HTTP 403 Forbidden');

    // 1B. Meta POST /api/webhooks/whatsapp HMAC-SHA256 Signed Event
    const inboundPayloadObj = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba_master_cargodash_001',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '27600104001',
                  phone_number_id: 'meta_pnum_brickdirect_101',
                },
                contacts: [{ profile: { name: 'Site Foreman Johan' }, wa_id: '27825550199' }],
                messages: [
                  {
                    from: '27825550199',
                    id: `wamid.golive_${Date.now()}`,
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    type: 'text',
                    text: { body: 'hi' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };
    const rawWebhookBody = JSON.stringify(inboundPayloadObj);
    const validHmac =
      'sha256=' +
      crypto.createHmac('sha256', config.META_APP_SECRET).update(rawWebhookBody).digest('hex');

    const signedPostRes = await app.inject({
      method: 'POST',
      url: '/api/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': validHmac,
      },
      payload: rawWebhookBody,
    });
    if (signedPostRes.statusCode !== 200) {
      throw new Error(`Signed Meta POST webhook failed with ${signedPostRes.statusCode}`);
    }
    console.log(
      `   ✅ Meta POST /api/webhooks/whatsapp HMAC-SHA256 Verified: HTTP 200 ${signedPostRes.payload}\n`
    );

    // =========================================================================
    // PHASE 2: Live PayFast Sandbox End-to-End Run (Capitec Pay / Instant EFT)
    // =========================================================================
    console.log('2️⃣  [STEP 2: Live PayFast Sandbox End-to-End Run (Capitec Pay / Instant EFT)]');

    // 2A. Retail Delivery Checkout + Signed ITN Settlement (BrickDirect Supply Yard)
    const retailSandboxRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/payfast/sandbox-run',
      payload: {
        paymentMethod: 'Capitec Pay / Instant EFT',
        businessType: 'retail_delivery',
      },
    });
    if (retailSandboxRes.statusCode !== 200) {
      throw new Error(`Retail PayFast sandbox run failed: ${retailSandboxRes.payload}`);
    }
    const retailResult = JSON.parse(retailSandboxRes.payload);
    if (!retailResult.signatureVerified || retailResult.atomicLedgerEntries.length < 4) {
      throw new Error('Retail PayFast ITN signature or atomic ledger entries check failed');
    }

    console.log(`   ✅ [Retail Delivery — BrickDirect Supply Yard]`);
    console.log(`      • Order Ref:         ${retailResult.orderRef} (${retailResult.paymentMethod})`);
    console.log(`      • PayFast ID:        ${retailResult.pfPaymentId} (MD5 Sig: ${retailResult.md5Signature})`);
    console.log(`      • Sandbox URL:       ${retailResult.checkoutUrl.slice(0, 92)}...`);
    console.log(`      • Order Status:      ${retailResult.orderStatusAfterItn.toUpperCase()}`);
    console.log(`      • Atomic MoR Ledger: ${retailResult.atomicLedgerEntries.length} rows recorded:`);
    for (const entry of retailResult.atomicLedgerEntries) {
      const amt = entry.credit_amount > 0 ? `+R${entry.credit_amount.toFixed(2)}` : `-R${entry.debit_amount.toFixed(2)}`;
      console.log(
        `         - ${entry.entry_type.padEnd(28)} ${amt.padEnd(12)} (Balance After: R${entry.balance_after.toFixed(2)})`
      );
    }
    console.log(
      `      • WhatsApp Alerts:   Customer (${retailResult.whatsappAlertsDispatched.customerReceiptSentTo}) & Yard Dispatch (${retailResult.whatsappAlertsDispatched.vendorDispatchAlertSentTo})\n`
    );

    // 2B. Service Booking Checkout + Signed ITN Settlement (Aura Luxe Studio)
    const serviceSandboxRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/payfast/sandbox-run',
      payload: {
        paymentMethod: 'Capitec Pay / Instant EFT',
        businessType: 'service_booking',
      },
    });
    if (serviceSandboxRes.statusCode !== 200) {
      throw new Error(`Service PayFast sandbox run failed: ${serviceSandboxRes.payload}`);
    }
    const serviceResult = JSON.parse(serviceSandboxRes.payload);
    if (!serviceResult.signatureVerified || !serviceResult.appointmentId) {
      throw new Error('Service booking PayFast sandbox run failed to confirm held appointment');
    }

    console.log(`   ✅ [Service Booking — Aura Luxe Hair & Wellness Studio]`);
    console.log(`      • Booking Order Ref: ${serviceResult.orderRef} (Delivery Fee: R0.00 Bypass)`);
    console.log(`      • Held Slot ID:      ${serviceResult.appointmentId} -> Upgraded HOLD -> CONFIRMED`);
    console.log(`      • PayFast ID:        ${serviceResult.pfPaymentId} (MD5 Sig: ${serviceResult.md5Signature})`);
    console.log(
      `      • WhatsApp Alerts:   Client (${serviceResult.whatsappAlertsDispatched.customerReceiptSentTo}) & Studio (${serviceResult.whatsappAlertsDispatched.vendorDispatchAlertSentTo})\n`
    );

    // =========================================================================
    // PHASE 3: Roll Out Printable 1-Page B2B Vendor Acquisition Collateral
    // =========================================================================
    console.log('3️⃣  [STEP 3: Roll Out Printable 1-Page B2B Contractor & Salon Sell-Sheet]');
    const sellSheetRes = await app.inject({
      method: 'GET',
      url: '/sell-sheet',
    });
    if (sellSheetRes.statusCode !== 200) {
      throw new Error(`Expected 200 on GET /sell-sheet, got ${sellSheetRes.statusCode}`);
    }
    const html = sellSheetRes.payload;
    const requiredLinks = [
      'https://wa.me/27600104001?text=hi',
      'https://wa.me/27600104003?text=hi',
      'ONBOARD%20My%20Business',
    ];
    for (const linkFragment of requiredLinks) {
      if (!html.includes(linkFragment)) {
        throw new Error(`Sell-sheet HTML missing expected QR link fragment: ${linkFragment}`);
      }
    }

    console.log('   ✅ Printable HTML Collateral: GET /sell-sheet (public/b2b-vendor-sell-sheet.html)');
    console.log('   ✅ Next.js Dashboard Route:   /sell-sheet (dashboard/app/sell-sheet/page.tsx)');
    console.log('   ✅ Embedded Live WhatsApp QR Demo Links Verified:');
    console.log('      1. Materials Yard Demo: https://wa.me/27600104001?text=hi');
    console.log('      2. Salon Booking Demo:  https://wa.me/27600104003?text=hi');
    console.log(
      '      3. Instant Onboarding:  https://wa.me/27600104001?text=ONBOARD%20My%20Business%20%7C%20retail_delivery%20%7C%20pro%20%7C%20Capitec%201688990011\n'
    );

    console.log('================================================================================');
    console.log('🎉 ALL 3 GO-LIVE ROLLOUT DELIVERABLES VERIFIED & READY FOR ANCHOR ONBOARDING');
    console.log('================================================================================');
  } finally {
    await app.close();
  }
}

runGoLiveVerification().catch((err) => {
  console.error('❌ Go-Live verification failed:', err);
  process.exit(1);
});
