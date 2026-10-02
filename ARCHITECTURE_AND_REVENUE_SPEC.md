# Cargo-Dash / WhatsApp Commerce Aggregator — Architecture & Revenue Engine Specification

> **Purpose**: Single source of truth for architectural decisions, financial formulas, database schemas, webhook security protocols, background queues, and API contracts across all modules. Keep this file updated whenever core monetization, ledger, or infrastructure logic evolves.

---

## 1. Multi-Tenant Revenue Engine & PayFast Merchant-of-Record (MoR) Fee Arbitrage

### 1.1 Business Model Overview
The platform operates as the **Merchant of Record (MoR)** for aggregated supplier WhatsApp catalogs. Suppliers process all customer transactions through the platform's unified master PayFast merchant account and monetize via three pillars:

1. **SaaS Platform Subscription**: Recurring monthly platform fee per vendor tier (`R299`–`R999`/mo).
2. **Take-Rate Facilitation Commission**: `5%` to `8%` retained per completed order.
3. **Payment Processing Spread (Interchange Arbitrage)**:
   - Standalone micro-merchants pay standard unnegotiated gateway fees (e.g., `2.9% + R2.00` or `3.2% + R2.00`).
   - By pooling transaction volume through our master PayFast account, the platform receives wholesale interchange rates (e.g., `2.0% + R1.50`).
   - The platform charges the vendor the billed rate (`processing_fee_billed_rate`) and retains the positive basis-point + fixed-fee spread (`gateway_margin_spread`).

### 1.2 Subscription Tier Presets
Defined in [`src/services/revenue/mor-revenue-engine.service.ts`](src/services/revenue/mor-revenue-engine.service.ts):

| Tier | Monthly SaaS Fee (`ZAR`) | Default Commission Rate | Default Billed Processing Fee | Wholesale Actual Cost (Master Account) |
| :--- | :--- | :--- | :--- | :--- |
| **`starter`** | `R299.00` | `8.0%` (`0.08`) | `3.2% + R2.00` | `2.0% + R1.50` |
| **`pro`** | `R599.00` | `6.5%` (`0.065`) | `2.9% + R2.00` | `2.0% + R1.50` |
| **`enterprise`** | `R999.00` | `5.0%` (`0.05`) | `2.5% + R1.75` | `2.0% + R1.50` |

### 1.3 Mathematical Settlement Formulas & Zero-Leakage Identity
For every order settled through the engine (`calculateOrderSettlement` in [`src/services/revenue/mor-revenue-engine.service.ts`](src/services/revenue/mor-revenue-engine.service.ts)):

```text
gross_amount          = round2(order_subtotal + haulage_fee)
platform_commission   = round2(gross_amount * commission_rate)
payment_fee_charged   = calculate_fee(gross_amount, processing_fee_billed_rate)
payment_fee_actual    = calculate_fee(gross_amount, processing_fee_actual_cost)
gateway_margin_spread = round2(payment_fee_charged - payment_fee_actual)
net_vendor_payout     = round2(gross_amount - (platform_commission + payment_fee_charged))
total_platform_yield  = round2(platform_commission + gateway_margin_spread)
```

Where `calculate_fee(amount, rate)` evaluates:
```text
fee = round2((amount * rate.percentage_rate) + rate.fixed_fee_zar)
```
*(Accepts either structured `{ percentage_rate: 0.029, fixed_fee_zar: 2.00 }` or human-readable strings like `"2.9% + R2.00"` via `parseFeeRate`).*

#### Zero-Leakage Accounting Identity
Every cent of `gross_amount` is strictly accounted for across the 4 leaf buckets:
```text
net_vendor_payout + platform_commission + gateway_margin_spread + payment_fee_actual === gross_amount
```
And total platform yield combines take-rate and interchange spread:
```text
total_platform_yield === platform_commission + gateway_margin_spread
```

---

## 2. Five-Component Double-Entry Escrow Ledger (`ledger_entries`)

### 2.1 Ledger Entry Enum (`ledger_entry_type`)
Defined in [`migrations/001_initial_schema.sql`](migrations/001_initial_schema.sql) and [`src/types/database.types.ts`](src/types/database.types.ts):
- `customer_payment_received`: `+gross_amount` (Customer funds settled into platform escrow clearing)
- `platform_commission_earned`: `+platform_commission` (Platform facilitation take-rate revenue)
- `payment_spread_retained`: `+gateway_margin_spread` (Net processing interchange arbitrage profit retained by platform)
- `gateway_fee_disbursed`: `-payment_fee_actual` (Wholesale PayFast cost debited at source)
- `vendor_payout_disbursed`: `+net_vendor_payout` (Net payable credited to supplier's unsettled escrow balance)
- `saas_subscription_setoff`: `-setoff_amount` (Automated monthly SaaS fee deducted from unsettled vendor balance prior to EFT payout)
- `gateway_fee_deducted`: Legacy/general fee deduction entry
- `refund_reversed`: Order refund / reversal entry

### 2.2 PayFast ITN Settlement Ledger Recording
When [`PayFastLedgerTransactionService.processItnPayment`](src/services/ledger/payfast-ledger-transaction.service.ts) processes a verified `COMPLETE` PayFast ITN webhook:

| Step | `entry_type` | `debit` (`ZAR`) | `credit` (`ZAR`) | Vendor Escrow `balance_after` | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `customer_payment_received` | `0.00` | `gross_amount` | `prev + gross_amount` | Gross customer funds received in escrow |
| **2** | `platform_commission_earned` | `platform_commission` | `0.00` | `prev + gross_amount - platform_commission` | Platform facilitation commission retained |
| **3** | `payment_spread_retained` | `gateway_margin_spread` | `0.00` | `prev + gross_amount - platform_commission - spread` | Payment processing interchange spread retained |
| **4** | `gateway_fee_disbursed` | `payment_fee_actual` | `0.00` | `prev + net_vendor_payout` | PayFast wholesale gateway cost disbursed |
| **5** | `vendor_payout_disbursed` | `0.00` | `net_vendor_payout` | `prev + net_vendor_payout` | Net vendor payout payable to supplier |

---

## 3. Monthly SaaS Subscription Billing & Automated Ledger Set-Off

Implemented in [`src/services/revenue/saas-subscription-billing.service.ts`](src/services/revenue/saas-subscription-billing.service.ts):

### 3.1 Priority Waterfall (`billVendorMonthlySubscription`)
1. **Automated Ledger Set-Off (`LEDGER_SETOFF`)**:
   - If `vendor.auto_ledger_setoff !== false` and the vendor has a positive unsettled escrow balance (`PostgresLedgerService.getVendorBalance(vendorId)`):
   - Deducts up to `subscription_monthly_fee` directly from the vendor's unsettled order balance using `saas_subscription_setoff` before weekly bank EFT payouts are released.
   - Syncs a paid Xero subscription tax invoice (`ACCREC`) for audit completeness.
   - If the vendor's balance only partially covers the monthly fee (`PARTIAL_SETOFF_AND_INVOICE`), deducts the available balance and bills the remainder via PayFast token or Xero recurring invoice.
2. **PayFast Tokenized / Ad-Hoc Charge (`PAYFAST_TOKEN_CHARGE`)**:
   - If `vendor.payfast_subscription_token` is configured, triggers an ad-hoc charge against `POST https://api.payfast.co.za/subscriptions/{token}/adhoc`.
3. **Xero Recurring Invoice Schedule (`XERO_RECURRING_INVOICE`)**:
   - Generates an AUTHORISED Xero SaaS invoice (`ACCREC`, `AccountCode: 200`, `15% South African VAT`) for the monthly subscription fee.

---

## 4. Production Webhook Handshake & Event Ingestion Engine

Implemented in [`src/controllers/whatsapp-cloud-webhook.controller.ts`](src/controllers/whatsapp-cloud-webhook.controller.ts) and [`src/services/queue/whatsapp-webhook.queue.ts`](src/services/queue/whatsapp-webhook.queue.ts):

### 4.1 Handshake Verification (`GET /api/webhooks/whatsapp` & `GET /webhook`)
- Extracts query parameters: `hub.mode`, `hub.verify_token`, `hub.challenge`.
- Validates `hub.mode === 'subscribe'` and `hub.verify_token === process.env.META_WEBHOOK_VERIFY_TOKEN` (with fallback to `WHATSAPP_VERIFY_TOKEN`).
- Responds `200 OK` (`text/plain`) with raw `hub.challenge` string, or `403 Forbidden`.

### 4.2 Cryptographic Ingestion (`POST /api/webhooks/whatsapp` & `POST /webhook`)
- **Raw Body Preservation**: Preserves raw HTTP request `Buffer` in both Fastify (`src/fastify-app.ts`) and Express (`src/app.ts`).
- **Timing-Safe HMAC-SHA256 Check**: Computes `sha256=` + HMAC-SHA256 of the raw request buffer using `META_APP_SECRET` and verifies against `x-hub-signature-256` via `crypto.timingSafeEqual`. Returns `401 Unauthorized` on mismatch or missing header.
- **Non-Blocking `<500ms` SLA**: Immediately returns `200 OK` with `"EVENT_RECEIVED"` and asynchronously enqueues the payload into `WhatsAppWebhookIngestionQueue` for routing (supplier media catalog upload vs. customer checkout state machine).

---

## 5. BullMQ Background Job Queue (`order-tasks`)

Implemented in [`src/services/queue/order-queue.worker.ts`](src/services/queue/order-queue.worker.ts):
- Connects to Railway Redis via `process.env.REDIS_URL` (`maxRetriesPerRequest: null`), with automatic in-memory fallback when `MOCK_EXTERNAL_APIS=true` or Redis is offline in test environments.
- Supported Job Types (`concurrency: 5`):
  1. `PROCESS_IMAGE_CATALOG`: Runs Sharp 1024x1024 image normalization, OpenAI/Anthropic Vision attribute extraction, Cloudinary CDN upload, and Meta Catalog sync.
  2. `SYNC_XERO_TRANSACTION`: Generates Xero platform commission tax invoice (`ACCREC`) and vendor settlement bill (`ACCPAY`).
  3. `DISPATCH_WHATSAPP_ALERT`: Dispatches Meta Cloud API interactive button/CTA messages and order notifications.
  4. `BILL_SAAS_SUBSCRIPTION`: Executes single-vendor or full-cycle monthly SaaS subscription billing & automated ledger set-off.

---

## 6. Deployment & Infrastructure Specification (Railway + Supabase Hybrid)

### 6.1 Hybrid Stack Architecture (~$5/mo MVP Cost)
- **Compute & Queue (Railway)**:
  - Runs the [`Dockerfile`](Dockerfile) container (`node:20-bookworm-slim` + `libvips42`) and a **Railway Redis** instance connected via `REDIS_URL`.
  - Configured by [`railway.json`](railway.json) with `healthcheckPath: "/health"` and `healthcheckTimeout: 100`.
- **Spatial Database (Supabase PostgreSQL + PostGIS)**:
  - Enable the **`postgis`** extension in Supabase (`Database -> Extensions -> postgis`).
  - **Application Queries (`DATABASE_URL`)**: Use the **Supabase Supavisor Transaction Pooler** URL (Port `6543`, `*.pooler.supabase.com:6543/postgres?pgbouncer=true`).
  - **DDL Schema Migrations (`DIRECT_URL`)**: Use the **Supabase Session / Direct** URL (Port `5432`, `*.pooler.supabase.com:5432/postgres` or `db.<project-ref>.supabase.co:5432/postgres`).
  - **Automatic SSL & Schema Resolution**: [`src/database/db.ts`](src/database/db.ts) (`resolveDatabaseProfile`) automatically detects `*.supabase.co` / `*.pooler.supabase.com`, enables `ssl: { rejectUnauthorized: false }`, and executes `SET search_path TO public, extensions;` on pooled connections.
  - **Zero-Touch Startup Migration**: Set `AUTO_MIGRATE_ON_STARTUP=true` in Railway variables (or run `npm run migrate` / `POST /api/v1/system/migrate`) to apply [`migrations/001_initial_schema.sql`](migrations/001_initial_schema.sql) idempotently.

### 6.2 Container & Framework Parity
- **[`Dockerfile`](Dockerfile)**:
  - Multi-stage `node:20-bookworm-slim` build.
  - `builder` stage installs `python3`, `make`, `g++`, `libvips-dev`, runs `npm ci` and `npm run build`.
  - `runner` stage installs runtime `libvips42` (for `sharp`), runs `npm ci --only=production`, copies `dist/`, exposes port `3000`, and executes `CMD ["node", "dist/index.js"]`.
- **Unified Express & Fastify Parity**:
  - Both [`src/app.ts`](src/app.ts) (Express, launched by `dist/index.js`) and [`src/fastify-app.ts`](src/fastify-app.ts) (Fastify) mount identical controllers and webhook/revenue/accounting/payout/health routes.

---

## 7. Antigravity Gemini Flash Engine & Cloud Virtual Numbers (Zero-Data Operations)

Per architectural policy, **OpenAI is completely removed at runtime** so there is zero ongoing OpenAI API cost or dependency. All AI intelligence, multimodal vision catalog extraction, and operations synthesis run exclusively on **Google Gemini Flash (`gemini-2.5-flash` via `GEMINI_API_KEY`)** paired with deterministic TypeScript financial and PostGIS engines.

### 7.1 Cloud Virtual WhatsApp Numbers (Zero Phone / Zero SIM Data Required)
Implemented in [`src/services/whatsapp/virtual-number-manager.service.ts`](src/services/whatsapp/virtual-number-manager.service.ts) and [`src/controllers/virtual-number.controller.ts`](src/controllers/virtual-number.controller.ts):
- **100% Cloud-Hosted Storefronts (`ONLINE_24_7_CLOUD`)**:
  - Each vendor is provisioned a dedicated or shared **Meta Cloud API Virtual Phone Number** (`phone_number_id` bound to the Railway backend webhook `/api/webhooks/whatsapp`).
  - **Zero Supplier Data Required for Storefront Uptime**: Because the virtual number lives on Meta's cloud servers and communicates directly with our Railway container via HTTPS webhooks, the vendor's physical phone can be **switched off**, out of battery, or have **zero mobile data**, and their 24/7 WhatsApp storefront still quotes prices, calculates PostGIS haulage, and collects PayFast MoR payments automatically.

### 7.2 Zero-Data In-WhatsApp Vendor & Driver Command Protocol (`< 1 KB` Text Frames)
- In South Africa, mobile carriers offer low-cost or zero-rated **WhatsApp-only bundles** where standard web browsers are blocked without a full data package.
- Vendors and truck drivers can manage their entire operation **100% inside WhatsApp** by texting simple commands to their Virtual Number (automatically routed by [`src/services/queue/whatsapp-queue.worker.ts`](src/services/queue/whatsapp-queue.worker.ts) and testable via `POST /api/v1/virtual-numbers/zero-data-command`):
  - `STATUS` / `BALANCE`: Returns real-time paid dispatch queue count, net escrow payout balance, and active catalog count.
  - `ORDERS` / `QUEUE`: Lists top active orders (`PAID`, `PROCESSING`) with customer addresses and waybill refs.
  - `LOAD <ORD-REF>` (or `DISPATCH <ORD-REF>`): Marks the order as `PROCESSING` (Truck Loaded & En-Route) and notifies the buyer on WhatsApp.
  - `DONE <ORD-REF>` (or `DELIVER <ORD-REF>`): Marks the order as `COMPLETED` (POD Confirmed) and releases the net payout to the vendor's escrow balance.
  - `PRICE <ITEM> R<PRICE>`: Updates a product's unit price in the live WhatsApp Catalog immediately.
  - `STOCK ON <ITEM>` / `STOCK OFF <ITEM>`: Toggles product availability in the live WhatsApp Catalog.
  - `HELP`: Sends a compact command cheat-sheet (`< 1 KB` payload).

### 7.3 4-Workspace Sleek Vendor Dashboard ([`dashboard/app/page.tsx`](dashboard/app/page.tsx))
1. **Live Dispatch & Waybills**: Real-time order pipeline (`Paid -> Dispatched -> Delivered`), WhatsApp customer notifications, and printable Driver Loading Slips.
2. **MoR Revenue, Fee Arbitrage & Escrow Set-Off Studio**: Interactive Tier Switcher, Live Order Settlement & Zero-Leakage Simulator, 5-Component Double-Entry Ledger table, and 1-click Monthly SaaS Subscription Set-Off.
3. **WhatsApp Catalog & Gemini Vision Studio**: Synced Meta Catalog inventory grid, 1-click stock toggle, and Gemini Flash product spec generator.
4. **Cloud Virtual Numbers, Zero-Data Simulator & Gemini Flash Studio**: Live registry of server-hosted Meta Cloud API virtual numbers, interactive Zero-Data WhatsApp Command Terminal (`STATUS`, `LOAD`, `DONE`, `PRICE`, `STOCK`), and the Antigravity Gemini Flash co-architect console.

---

### 8. Multi-Tenant Virtual Number Dynamic Routing, Service/Appointment Engine & Split Logic

### 8.1 Dynamic Virtual Number Ingress Routing & Strict Tenant Isolation
- **Vendor Schema Extensions** ([`migrations/002_multi_tenant_virtual_numbers_and_appointments.sql`](migrations/002_multi_tenant_virtual_numbers_and_appointments.sql)):
  - `meta_phone_number_id VARCHAR(100) UNIQUE NOT NULL`: Maps each vendor's dedicated Meta Cloud API Virtual Number (`metadata.phone_number_id`) directly to its `vendor_id`.
  - `meta_catalog_id VARCHAR(100)`: Vendor-scoped Meta Commerce Catalog ID.
  - `business_type VARCHAR(50) NOT NULL`: `'retail_delivery'` (building yards, pizza/restaurants) | `'service_booking'` (hairdressers, massage therapists, trade services).
- **Webhook Ingress & Session Scoping**:
  - [`WhatsAppQueueWorker`](src/services/queue/whatsapp-queue.worker.ts) extracts `metadata.phone_number_id` and `metadata.display_phone_number` from every inbound Meta webhook payload and passes them into [`ConversationStateMachine.handleIncomingMessage`](src/services/state-machine/conversation-state-machine.ts).
  - [`PostgresVendorRepository.resolveByWebhookMetadata`](src/database/postgres-vendor.repository.ts) resolves the exact tenant `DbVendor` by `meta_phone_number_id`.
  - [`ConversationSessionStore`](src/services/state-machine/conversation-session.store.ts) keys all Redis/in-memory customer sessions by `${vendorId}::${waId}`. A customer texting Yard A (`meta_pnum_brickdirect_101`) and Pizza Shop D (`meta_pnum_napoli_104`) or Salon C (`meta_pnum_auraluxe_103`) simultaneously maintains completely isolated carts, catalogs, and checkout flows.

### 8.2 Booking & Appointment Slot Engine (`service_booking` Businesses)
- **Database Tables** ([`migrations/002_multi_tenant_virtual_numbers_and_appointments.sql`](migrations/002_multi_tenant_virtual_numbers_and_appointments.sql)):
  - `vendor_service_schedules`: `vendor_id`, `day_of_week (0-6)`, `start_time (TIME)`, `end_time (TIME)`, `slot_duration_minutes (INT)`, `max_concurrent_bookings (INT)`.
  - `appointments`: `id`, `vendor_id`, `customer_phone`, `customer_name`, `service_product_id` (FK to `products`), `scheduled_start (TIMESTAMPTZ)`, `scheduled_end (TIMESTAMPTZ)`, `status` (`'hold' | 'confirmed' | 'cancelled' | 'completed'`), `payfast_pf_payment_id`, `hold_expires_at`.
- **Real-Time Slot Engine** ([`src/services/booking/appointment-engine.service.ts`](src/services/booking/appointment-engine.service.ts)):
  - `getNextAvailableSlots(vendorId, serviceProductId, fromDate, limit = 3)` queries the vendor's operating schedule and active `hold`/`confirmed` appointments to return the **next 3 available time slots**.
  - `placeTemporarySlotHold(...)` places an atomic **10-minute hold** (`status = 'hold'`) on the selected slot while generating the PayFast checkout CTA button.
  - `releaseExpiredHolds()` automatically cancels (`status = 'cancelled'`) any hold where PayFast ITN settlement is not received within the 10-minute window.

### 8.3 Split Checkout Pipeline: Physical Freight (`retail_delivery`) vs. Service Booking (`service_booking`)
- **`business_type = 'retail_delivery'` (Builders Yards, Restaurants)**:
  - Transitions from `ITEM_SELECTION -> LOCATION_PIN -> QUOTE_SUMMARY -> AWAITING_PAYMENT`.
  - Executes PostGIS `check_vendor_delivery_radius` and calculates per-km haulage/delivery fees.
  - Dispatches driver loading slips upon PayFast ITN settlement.
- **`business_type = 'service_booking'` (Salons, Spas, Trade Services)**:
  - Replaces `LOCATION_PIN` and PostGIS distance calculation with `SLOT_SELECTION` (`ITEM_SELECTION -> SLOT_SELECTION -> AWAITING_PAYMENT`).
  - Sends an interactive WhatsApp List Message displaying the next 3 available appointment slots.
  - Sets `delivery_fee = 0.00` and `distance_km = 0`, places a 10-minute temporary hold on the chosen slot, and sends a PayFast deposit/checkout CTA link carrying `vendorId` (`custom_str4`) and `appointmentId` (`custom_str5`).
  - Upon PayFast ITN settlement, [`PayFastLedgerTransactionService.processItnPayment`](src/services/ledger/payfast-ledger-transaction.service.ts) dynamically resolves the tenant vendor slice, records the atomic double-entry ledger rows (`customer_payment_received`, `platform_commission_earned`, `payment_spread_retained`, `gateway_fee_disbursed`, `vendor_payout_disbursed`), transitions the appointment to `status = 'confirmed'`, and sends a booking confirmation message instead of a truck driver loading slip.

---

## 9. Key Files Index

| Domain | File Path | Responsibility |
| :--- | :--- | :--- |
| **Initial DB Schema** | [`migrations/001_initial_schema.sql`](migrations/001_initial_schema.sql) | PostgreSQL + PostGIS tables (`vendors`, `products`, `orders`, `ledger_entries`) |
| **Multi-Tenant & Appointments Migration** | [`migrations/002_multi_tenant_virtual_numbers_and_appointments.sql`](migrations/002_multi_tenant_virtual_numbers_and_appointments.sql) | Extends `vendors` (`meta_phone_number_id`, `meta_catalog_id`, `business_type`) & adds `vendor_service_schedules` + `appointments` |
| **DB Pool & Supavisor** | [`src/database/db.ts`](src/database/db.ts) | Supabase Supavisor (`:6543`) + Direct (`:5432`) connection pooler, SSL, & `/health` diagnostics |
| **TypeScript Types** | [`src/types/database.types.ts`](src/types/database.types.ts) | Core database interfaces, `VendorBusinessType`, `DbVendorServiceSchedule`, `DbAppointment`, `DbLedgerEntryType` |
| **Appointment Slot Engine** | [`src/services/booking/appointment-engine.service.ts`](src/services/booking/appointment-engine.service.ts) | Real-time 3-slot generator, 10-minute temporary slot holds, hold expiry sweeper, and PayFast ITN slot confirmation |
| **Split State Machine** | [`src/services/state-machine/conversation-state-machine.ts`](src/services/state-machine/conversation-state-machine.ts) | Tenant-isolated conversational router supporting both `retail_delivery` (PostGIS freight) and `service_booking` (`SLOT_SELECTION`) |
| **Tenant Session Store** | [`src/services/state-machine/conversation-session.store.ts`](src/services/state-machine/conversation-session.store.ts) | Composite `${vendorId}::${waId}` session isolation across virtual phone numbers |
| **MoR Revenue Engine** | [`src/services/revenue/mor-revenue-engine.service.ts`](src/services/revenue/mor-revenue-engine.service.ts) | Dynamic tier presets, `parseFeeRate`, `calculate_fee`, `calculateOrderSettlement`, `settleOrderWithArbitrage` |
| **SaaS Subscription Billing** | [`src/services/revenue/saas-subscription-billing.service.ts`](src/services/revenue/saas-subscription-billing.service.ts) | Monthly subscription billing worker, automated ledger set-off, PayFast tokenized charge, Xero recurring invoice |
| **Revenue Controller** | [`src/controllers/revenue.controller.ts`](src/controllers/revenue.controller.ts) | REST endpoints under `/api/v1/revenue/*` |
| **Virtual Number & Zero-Data** | [`src/services/whatsapp/virtual-number-manager.service.ts`](src/services/whatsapp/virtual-number-manager.service.ts) | Cloud Virtual WhatsApp Number provisioning & Zero-Data vendor/driver text command engine |
| **Virtual Number Controller** | [`src/controllers/virtual-number.controller.ts`](src/controllers/virtual-number.controller.ts) | REST endpoints `/api/v1/virtual-numbers`, `/provision`, `/zero-data-command` |
| **Gemini Flash Studio Bridge** | [`src/services/ai/openai-bridge.service.ts`](src/services/ai/openai-bridge.service.ts) | Antigravity Gemini Flash (`gemini-2.5-flash`) + Deterministic Financial/Spatial Engine (zero OpenAI dependency) |
| **Gemini Vision Extractor** | [`src/services/vision/vision.service.ts`](src/services/vision/vision.service.ts) | `sharp` image compression + Gemini Flash multimodal catalog product extraction |
| **Vendor Dashboard UI** | [`dashboard/app/page.tsx`](dashboard/app/page.tsx) | Next.js 14 4-Workspace Industrial Command Center, Virtual Number & Zero-Data Simulator |
| **PayFast ITN & Ledger** | [`src/services/ledger/payfast-ledger-transaction.service.ts`](src/services/ledger/payfast-ledger-transaction.service.ts) | PayFast ITN validation, dynamic vendor resolution, appointment confirmation & atomic double-entry ledger settlement |
| **Postgres Ledger Service** | [`src/database/postgres-ledger.service.ts`](src/database/postgres-ledger.service.ts) | Double-entry ledger repository, `recordEntryWithExplicitBalance`, `deductSubscriptionSetoff` |
| **Vendor Repository** | [`src/database/postgres-vendor.repository.ts`](src/database/postgres-vendor.repository.ts) | Vendor CRUD, `findByMetaPhoneNumberId`, `resolveByWebhookMetadata`, and multi-tenant seed profiles |
| **Meta Cloud Webhook** | [`src/controllers/whatsapp-cloud-webhook.controller.ts`](src/controllers/whatsapp-cloud-webhook.controller.ts) | `GET`/`POST /api/webhooks/whatsapp` handshake & `x-hub-signature-256` verification |
| **WhatsApp Queue Worker** | [`src/services/queue/whatsapp-queue.worker.ts`](src/services/queue/whatsapp-queue.worker.ts) | Inbound WhatsApp message processor extracting `metadata.phone_number_id` & routing Zero-Data Vendor Commands |
| **Multi-Tenant & Booking Tests** | [`tests/multi-tenant-virtual-numbers-and-appointments.test.ts`](tests/multi-tenant-virtual-numbers-and-appointments.test.ts) | Unit & integration tests for tenant isolation across `phone_number_id`s, 3-slot booking + 10-min hold expiry, and MoR sub-accounting |
| **Revenue Test Suite** | [`tests/mor-revenue-engine.test.ts`](tests/mor-revenue-engine.test.ts) | End-to-end tests for MoR fee arbitrage, 5-row ledger, and SaaS subscription set-off |
| **Virtual Number Test Suite** | [`tests/virtual-numbers-zero-data.test.ts`](tests/virtual-numbers-zero-data.test.ts) | Cloud Virtual Number provisioning & Zero-Data command protocol tests |
