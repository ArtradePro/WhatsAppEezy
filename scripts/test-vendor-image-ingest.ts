/**
 * Standalone Test Runner: Live WhatsApp Supplier Image Upload, Vision AI Extraction, & Meta Catalog Push
 *
 * Usage:
 *   npx tsx scripts/test-vendor-image-ingest.ts
 */

import sharp from 'sharp';
import { vendorProductIngestionService } from '../src/services/vendor/vendor-product-ingestion.service';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';
import { postgresProductRepository } from '../src/database/postgres-product.repository';

async function main() {
  console.log('================================================================');
  console.log('🚀 WhatsApp Supplier Image Ingestion & Catalog Push Simulator');
  console.log('================================================================\n');

  // 1. Registered vendor phone number
  const vendorPhone = '+27820000001';
  console.log(`🔍 1. Verifying registered vendor: ${vendorPhone}...`);
  const vendor = await postgresVendorRepository.findByWhatsAppNumber(vendorPhone);
  if (!vendor) {
    console.error('❌ Vendor not found in database!');
    process.exit(1);
  }
  console.log(`✅ Vendor identified: ${vendor.business_name} (ID: ${vendor.id})\n`);

  // 2. Generate a sample raw building material photo (e.g. plaster sand / bricks)
  console.log('📸 2. Generating sample supplier product photo (600x450 raw sand texture)...');
  const samplePhotoBuffer = await sharp({
    create: {
      width: 600,
      height: 450,
      channels: 3,
      background: { r: 194, g: 154, b: 108 }, // Golden plaster sand tone
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer();

  const caption = 'Premium Plaster Sand bulk load R580 per cube direct from quarry';
  console.log(`💬 Supplier WhatsApp Caption: "${caption}"\n`);

  // 3. Vision AI Extraction & Price Override
  console.log('🤖 3. Running Vision AI extraction & caption price override parser...');
  const specs = await vendorProductIngestionService.extractSpecsFromVision(samplePhotoBuffer, caption);
  console.log('✅ Structured Specifications Extracted:');
  console.log(JSON.stringify(specs, null, 2), '\n');

  // 4. Sharp Image Standardization (1024x1024 #F8F9FA, bottom pill banner, <500KB)
  console.log('🎨 4. Standardizing image via Sharp.js (1024x1024 #F8F9FA, auto-orient, bottom pill banner)...');
  const { buffer: enhancedBuffer, cdnUrl } = await vendorProductIngestionService.standardizeImage(
    samplePhotoBuffer,
    vendor.business_name,
    specs.unit_of_measure
  );

  const meta = await sharp(enhancedBuffer).metadata();
  console.log(`✅ Canvas Standardized: ${meta.width}x${meta.height} px, Size: ${(enhancedBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`🌐 Public CDN URL: ${cdnUrl}\n`);

  // 5. Save Product Draft in Database
  console.log('💾 5. Persisting product draft into database...');
  const draft = await vendorProductIngestionService.saveProductDraft({
    vendorId: vendor.id,
    specs,
    enhancedImageUrl: cdnUrl,
  });
  console.log(`✅ Product Draft Created (ID: ${draft.id}, Retailer ID: ${draft.meta_product_retailer_id})\n`);

  // 6. Interactive Vendor Preview Dispatch
  console.log('📱 6. Dispatching WhatsApp interactive preview card to vendor...');
  console.log(`   Header: Image [${cdnUrl}]`);
  console.log(`   Text: "✅ Product drafted: *${draft.title}* @ *R${draft.unit_price} ${draft.unit_of_measure}*"`);
  console.log(`   Buttons: [Approve & Publish] | [Edit Price] | [Discard]\n`);

  // 7. Simulating Vendor Tapping [Approve & Publish]
  console.log('⚡ 7. Simulating vendor tapping [Approve & Publish] -> pushing to Meta Commerce Catalog...');
  const published = await vendorProductIngestionService.publishProductToMetaCatalog(draft.id);
  console.log(`✅ Pushed to Meta Commerce Manager!`);
  console.log(`   Catalog ID: ${published?.meta_catalog_id}`);
  console.log(`   Retailer SKU: ${published?.meta_product_retailer_id}`);
  console.log(`   Status: is_available = ${published?.is_available}\n`);

  console.log('================================================================');
  console.log('🎉 End-to-End WhatsApp Supplier Ingestion Pipeline Verified!');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
