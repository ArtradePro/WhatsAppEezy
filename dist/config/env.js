"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
// Load environment variables from .env file
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().catch(3000).default(3000),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).catch('production').default('development'),
    // Cloudinary Configuration
    CLOUDINARY_CLOUD_NAME: zod_1.z.string().default('mock-cloud'),
    CLOUDINARY_API_KEY: zod_1.z.string().default('mock-key'),
    CLOUDINARY_API_SECRET: zod_1.z.string().default('mock-secret'),
    CLOUDINARY_FOLDER: zod_1.z.string().default('whatsapp-commerce-catalog'),
    // AI Vision & Gemini Flash Runtime Configuration (OpenAI Removed)
    VISION_PROVIDER: zod_1.z.enum(['gemini', 'anthropic', 'openai']).catch('gemini').default('gemini'),
    GEMINI_API_KEY: zod_1.z.string().optional().default(process.env.GEMINI_API_KEY || ''),
    GEMINI_MODEL: zod_1.z.string().default(process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
    OPENAI_API_KEY: zod_1.z.string().optional().default(''),
    OPENAI_MODEL: zod_1.z.string().default('gemini-2.5-flash'),
    ANTHROPIC_API_KEY: zod_1.z.string().optional().default(''),
    ANTHROPIC_MODEL: zod_1.z.string().default('claude-3-5-sonnet-20241022'),
    // Meta Commerce Graph API Configuration
    META_GRAPH_API_VERSION: zod_1.z.string().default('v19.0'),
    META_GRAPH_BASE_URL: zod_1.z.string().default('https://graph.facebook.com'),
    META_CATALOG_ID: zod_1.z.string().default('mock-catalog-id'),
    META_ACCESS_TOKEN: zod_1.z.string().default('mock-meta-access-token'),
    // Branding & Catalog Defaults
    DEFAULT_BRAND_NAME: zod_1.z.string().default('WhatsAppEezy'),
    DEFAULT_CURRENCY: zod_1.z.string().default('ZAR'),
    DEFAULT_COMMERCE_BASE_URL: zod_1.z.string().default('https://wa.me/c/product'),
    // WhatsApp Business Cloud API & Gupshup Configuration
    WHATSAPP_PHONE_NUMBER_ID: zod_1.z.string().default('1359238143940536'),
    WHATSAPP_ACCESS_TOKEN: zod_1.z.string().default('mock-whatsapp-access-token'),
    WHATSAPP_VERIFY_TOKEN: zod_1.z.string().default('whatsappeezy_verify_2026'),
    WHATSAPP_BUSINESS_ACCOUNT_ID: zod_1.z.string().default('1097308319554548'),
    GUPSHUP_API_KEY: zod_1.z.string().optional().default(process.env.GUPSHUP_API_KEY || '1jyeu4hjqrdlmzonsgbklotw7gllpquj'),
    GUPSHUP_ACCOUNT_SECRET: zod_1.z.string().optional().default(process.env.GUPSHUP_ACCOUNT_SECRET || '6AGMN8SqCaOnjSe011WPRf7O1GV7zthLfH4q8ZCMJTUGFhsSArIKWKNFjVUPLFnC'),
    GUPSHUP_APP_ID: zod_1.z.string().optional().default(process.env.GUPSHUP_APP_ID || 'd4f0052b-a102-49f2-bf53-c737349628ee'),
    GUPSHUP_APP_NAME: zod_1.z.string().optional().default(process.env.GUPSHUP_APP_NAME || 'WhatsAppEezy'),
    GUPSHUP_SOURCE_NUMBER: zod_1.z.string().optional().default(process.env.GUPSHUP_SOURCE_NUMBER || '15554629242'),
    // Meta Cloud API Webhook Handshake & Cryptographic Security
    META_WEBHOOK_VERIFY_TOKEN: zod_1.z.string().default(process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || 'whatsappeezy_verify_2026'),
    META_APP_SECRET: zod_1.z.string().default(process.env.META_APP_SECRET || 'meta-app-secret-cargodash-prod'),
    // Distance & Delivery Configuration
    GOOGLE_MAPS_API_KEY: zod_1.z.string().default(''),
    VENDOR_DEFAULT_LAT: zod_1.z.coerce.number().catch(-34.1831).default(-34.1831), // Mossel Bay / Garden Route Depot
    VENDOR_DEFAULT_LNG: zod_1.z.coerce.number().catch(22.1465).default(22.1465),
    VENDOR_DEFAULT_WHATSAPP_NUMBER: zod_1.z.string().default('27747043506'),
    // PayFast Split-Checkout Configuration
    PAYFAST_MERCHANT_ID: zod_1.z.string().default('10000100'), // Default sandbox test merchant ID
    PAYFAST_MERCHANT_KEY: zod_1.z.string().default('46f0cd694581a'), // Default sandbox test merchant key
    PAYFAST_PASSPHRASE: zod_1.z.string().default('payfast_secure_passphrase'),
    PAYFAST_ENV: zod_1.z.enum(['sandbox', 'live']).catch('sandbox').default('sandbox'),
    PAYFAST_RETURN_URL: zod_1.z.string().default('https://whatsappeezy.com/?checkout=success'),
    PAYFAST_CANCEL_URL: zod_1.z.string().default('https://whatsappeezy.com/?checkout=cancelled'),
    PAYFAST_NOTIFY_URL: zod_1.z.string().default('https://whatsappeezy.up.railway.app/api/webhooks/payfast/itn'),
    PLATFORM_COMMISSION_PERCENTAGE: zod_1.z.coerce.number().catch(5.5).default(5.5), // 5.5% commission
    // Database Configuration (Supabase PostgreSQL + PostGIS / Supavisor Pooler)
    DATABASE_URL: zod_1.z.string().default(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/cargodash'),
    DIRECT_URL: zod_1.z.string().optional().default(process.env.DIRECT_URL || ''),
    DATABASE_SSL: zod_1.z.enum(['auto', 'true', 'false']).catch('auto').default('auto'),
    DATABASE_POOL_MAX: zod_1.z.coerce.number().catch(20).default(20),
    AUTO_MIGRATE_ON_STARTUP: zod_1.z
        .string()
        .default(process.env.AUTO_MIGRATE_ON_STARTUP || 'false')
        .transform((val) => val === 'true'),
    // Optional Supabase Platform Configuration
    SUPABASE_URL: zod_1.z.string().optional().default(process.env.SUPABASE_URL || ''),
    SUPABASE_SERVICE_ROLE_KEY: zod_1.z.string().optional().default(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
    // Railway Redis Configuration
    REDIS_URL: zod_1.z.string().optional().default(process.env.REDIS_URL || 'redis://localhost:6379'),
    // Operational Flags
    MOCK_EXTERNAL_APIS: zod_1.z
        .string()
        .default(process.env.OPENAI_API_KEY && process.env.META_ACCESS_TOKEN && process.env.CLOUDINARY_CLOUD_NAME !== 'mock-cloud'
        ? 'false'
        : 'true')
        .transform((val) => val === 'true'),
});
exports.config = envSchema.parse(process.env);
//# sourceMappingURL=env.js.map