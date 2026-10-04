"use strict";
/**
 * Corner Branding Overlay Generator
 * Generates an SVG badge vector for corner branding overlay on the 1024x1024 canvas.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCornerBrandingSvg = generateCornerBrandingSvg;
function generateCornerBrandingSvg(options = {}) {
    const brandName = (options.brandName || 'WHATSAPPEEZY').toUpperCase();
    const badgeLabel = (options.badgeLabel || 'VERIFIED SUPPLIER').toUpperCase();
    const width = options.width || 240;
    const height = options.height || 64;
    const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Drop Shadow Filter -->
    <filter id="badgeShadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.12"/>
    </filter>

    <!-- Linear Gradient for Badge Background -->
    <linearGradient id="badgeBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#1F2937"/>
    </linearGradient>

    <!-- Linear Gradient for Accent Shield/Icon -->
    <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#25D366"/>
      <stop offset="100%" stop-color="#128C7E"/>
    </linearGradient>
  </defs>

  <!-- Container Pill Badge -->
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="12" ry="12"
        fill="url(#badgeBg)" stroke="#374151" stroke-width="1.5" filter="url(#badgeShadow)"/>

  <!-- WhatsApp/Verified Emerald Shield Badge Icon -->
  <g transform="translate(14, 14)">
    <circle cx="18" cy="18" r="16" fill="url(#accentGradient)"/>
    <!-- Checkmark icon -->
    <path d="M12 18.5 L16 22.5 L24 13.5" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- Brand Typography -->
  <g transform="translate(58, 0)" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
    <!-- Brand Name -->
    <text x="0" y="28" fill="#FFFFFF" font-size="12" font-weight="700" letter-spacing="1">
      ${escapeXml(brandName)}
    </text>
    <!-- Sub-label -->
    <text x="0" y="44" fill="#9CA3AF" font-size="9" font-weight="600" letter-spacing="0.8">
      ${escapeXml(badgeLabel)}
    </text>
  </g>
</svg>
`.trim();
    return Buffer.from(svg, 'utf-8');
}
function escapeXml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
//# sourceMappingURL=corner-branding.js.map