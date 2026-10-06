import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().catch(3000).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).catch('production').default('development'),

  // Cloudinary Configuration
  CLOUDINARY_CLOUD_NAME: z.string().default('mock-cloud'),
  CLOUDINARY_API_KEY: z.string().default('mock-key'),
  CLOUDINARY_API_SECRET: z.string().default('mock-secret'),
  CLOUDINARY_FOLDER: z.string().default('whatsapp-commerce-catalog'),

  // AI Vision & Gemini Flash Runtime Configuration (OpenAI Removed)
  VISION_PROVIDER: z.enum(['gemini', 'anthropic', 'openai']).catch('gemini').default('gemini'),
  GEMINI_API_KEY: z.string().optional().default(process.env.GEMINI_API_KEY || ''),
  GEMINI_MODEL: z.string().default(process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gemini-2.5-flash'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022'),

  // Meta Commerce Graph API Configuration
  META_GRAPH_API_VERSION: z.string().default('v19.0'),
  META_GRAPH_BASE_URL: z.string().default('https://graph.facebook.com'),
  META_CATALOG_ID: z.string().default('mock-catalog-id'),
  META_ACCESS_TOKEN: z.string().default('mock-meta-access-token'),

  // Branding & Catalog Defaults
  DEFAULT_BRAND_NAME: z.string().default('WhatsAppEezy'),
  DEFAULT_CURRENCY: z.string().default('ZAR'),
  DEFAULT_COMMERCE_BASE_URL: z.string().default('https://wa.me/c/product'),

  // WhatsApp Business Cloud API & Gupshup Configuration
  WHATSAPP_PHONE_NUMBER_ID: z.string().default('1359238143940536'),
  WHATSAPP_ACCESS_TOKEN: z.string().default('mock-whatsapp-access-token'),
  WHATSAPP_VERIFY_TOKEN: z.string().default('whatsappeezy_verify_2026'),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().default('1076037725345370'),
  GUPSHUP_API_KEY: z.string().optional().default(process.env.GUPSHUP_API_KEY || 'eyJraWQiOiI1NDhiMTFmMWQ1Y2QxZGMyIiwiYWxnIjoiRWREU0EiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJDQVMtVjIiLCJ0dCI6IkFUIiwic3ViIjoiZDRmMDA1MmItYTEwMi00OWYyLWJmNTMtYzczNzM0OTYyOGVlIiwicnRpIjoiNDAwMDM4NDQ3MSIsImp0aSI6ImF0LTFrdnB3a2NwNXdpZW52ZWRqc3FtZ2dpaTA4eSIsImlhdCI6MTc5MTA5MjYxMSwiZXhwIjoxNzkxMTc5MDExLCJhdWQiOiJzcyIsInJvbGUiOiIqIn0.7mEyK5C2l2kgrR0xi9A6VpAK3DUAseJbMVHm30KubtynqIHw42wFgj1GGSVCNKEOe6-7EbRZc8zq4dUiFINxAg'),
  GUPSHUP_ACCOUNT_SECRET: z.string().optional().default(process.env.GUPSHUP_ACCOUNT_SECRET || '6AGMN8SqCaOnjSe011WPRf7O1GV7zthLfH4q8ZCMJTUGFhsSArIKWKNFjVUPLFnC'),
  GUPSHUP_APP_ID: z.string().optional().default(process.env.GUPSHUP_APP_ID || 'd4f0052b-a102-49f2-bf53-c737349628ee'),
  GUPSHUP_APP_NAME: z.string().optional().default(process.env.GUPSHUP_APP_NAME || 'WhatsAppEezy'),
  GUPSHUP_SOURCE_NUMBER: z.string().optional().default(process.env.GUPSHUP_SOURCE_NUMBER || '15554629242'),

  // Meta Cloud API Webhook Handshake & Cryptographic Security
  META_WEBHOOK_VERIFY_TOKEN: z.string().default(process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || 'whatsappeezy_verify_2026'),
  META_APP_SECRET: z.string().default(process.env.META_APP_SECRET || 'meta-app-secret-cargodash-prod'),

  // Distance & Delivery Configuration
  GOOGLE_MAPS_API_KEY: z.string().default(''),
  VENDOR_DEFAULT_LAT: z.coerce.number().catch(-34.1831).default(-34.1831), // Mossel Bay / Garden Route Depot
  VENDOR_DEFAULT_LNG: z.coerce.number().catch(22.1465).default(22.1465),
  VENDOR_DEFAULT_WHATSAPP_NUMBER: z.string().default('27747043506'),

  // PayFast Split-Checkout Configuration
  PAYFAST_MERCHANT_ID: z.string().default('10000100'), // Default sandbox test merchant ID
  PAYFAST_MERCHANT_KEY: z.string().default('46f0cd694581a'), // Default sandbox test merchant key
  PAYFAST_PASSPHRASE: z.string().default('payfast_secure_passphrase'),
  PAYFAST_ENV: z.enum(['sandbox', 'live']).catch('sandbox').default('sandbox'),
  PAYFAST_RETURN_URL: z.string().default('https://whatsappeezy.com/?checkout=success'),
  PAYFAST_CANCEL_URL: z.string().default('https://whatsappeezy.com/?checkout=cancelled'),
  PAYFAST_NOTIFY_URL: z.string().default('https://whatsappeezy.up.railway.app/api/webhooks/payfast/itn'),
  PLATFORM_COMMISSION_PERCENTAGE: z.coerce.number().catch(5.5).default(5.5), // 5.5% commission

  // Database Configuration (Supabase PostgreSQL + PostGIS / Supavisor Pooler)
  DATABASE_URL: z.string().default(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/cargodash'),
  DIRECT_URL: z.string().optional().default(process.env.DIRECT_URL || ''),
  DATABASE_SSL: z.enum(['auto', 'true', 'false']).catch('auto').default('auto'),
  DATABASE_POOL_MAX: z.coerce.number().catch(20).default(20),
  AUTO_MIGRATE_ON_STARTUP: z
    .string()
    .default(process.env.AUTO_MIGRATE_ON_STARTUP || 'false')
    .transform((val) => val === 'true'),

  // Optional Supabase Platform Configuration
  SUPABASE_URL: z.string().optional().default(process.env.SUPABASE_URL || ''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),

  // Railway Redis Configuration
  REDIS_URL: z.string().optional().default(process.env.REDIS_URL || 'redis://localhost:6379'),

  // Operational Flags
  MOCK_EXTERNAL_APIS: z
    .string()
    .default(
      process.env.OPENAI_API_KEY && process.env.META_ACCESS_TOKEN && process.env.CLOUDINARY_CLOUD_NAME !== 'mock-cloud'
        ? 'false'
        : 'true'
    )
    .transform((val) => val === 'true'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const config: EnvConfig = envSchema.parse(process.env);
