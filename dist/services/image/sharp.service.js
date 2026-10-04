"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sharpService = exports.SharpService = void 0;
const sharp_1 = __importDefault(require("sharp"));
const corner_branding_1 = require("../../assets/corner-branding");
class SharpService {
    defaultWidth = 1024;
    defaultHeight = 1024;
    defaultInnerMax = 880; // leaves 72px padding around bounding box
    /**
     * Reads metadata of any image buffer
     */
    async getImageMetadata(buffer) {
        return (0, sharp_1.default)(buffer).metadata();
    }
    /**
     * Processes the product image:
     * 1. Centers product on a 1024x1024 pure white canvas (#FFFFFF)
     * 2. Upscales/downscales to fit nicely within an 880x880 bounding area preserving aspect ratio
     * 3. Applies high-quality Lanczos3 resampling and sharpening for crisp commerce catalog viewing
     * 4. Composites standard corner branding (vector badge) at the specified corner
     */
    async processCanvas(inputBuffer, options = {}) {
        const targetWidth = options.targetWidth || this.defaultWidth;
        const targetHeight = options.targetHeight || this.defaultHeight;
        const innerMax = options.innerMaxDimension || this.defaultInnerMax;
        const cornerPosition = options.cornerPosition || 'top-right';
        const brandName = options.brandName || 'CARGODASH';
        // Step 1: Inspect input image
        const image = (0, sharp_1.default)(inputBuffer);
        const metadata = await image.metadata();
        // Step 2: Resize the product asset preserving aspect ratio to fit inside innerMax x innerMax
        // Use Lanczos3 kernel and subtle sharpen for high clarity
        const resizedProductBuffer = await image
            .resize({
            width: innerMax,
            height: innerMax,
            fit: 'inside',
            withoutEnlargement: false, // allow upscaling if supplier provided small photo
            kernel: sharp_1.default.kernel.lanczos3,
        })
            .sharpen({
            sigma: 1.0,
            m1: 0.5,
            m2: 1.0,
        })
            .toBuffer();
        // Step 3: Create a 1024x1024 pure white background canvas
        const whiteCanvas = (0, sharp_1.default)({
            create: {
                width: targetWidth,
                height: targetHeight,
                channels: 4,
                background: options.backgroundColor || { r: 255, g: 255, b: 255, alpha: 1 },
            },
        });
        // Step 4: Generate Corner Branding Badge
        const badgeWidth = 240;
        const badgeHeight = 64;
        const cornerMargin = 32;
        const badgeBuffer = options.customLogoBuffer ||
            (0, corner_branding_1.generateCornerBrandingSvg)({
                brandName,
                badgeLabel: 'VERIFIED SUPPLIER',
                width: badgeWidth,
                height: badgeHeight,
            });
        // Calculate coordinates for corner branding overlay
        const badgeCoordinates = this.calculateCornerCoordinates(cornerPosition, targetWidth, targetHeight, badgeWidth, badgeHeight, cornerMargin);
        // Step 5: Composite the resized product (centered) and the corner branding overlay
        const finalBuffer = await whiteCanvas
            .composite([
            {
                input: resizedProductBuffer,
                gravity: sharp_1.default.gravity.center,
            },
            {
                input: badgeBuffer,
                top: badgeCoordinates.top,
                left: badgeCoordinates.left,
            },
        ])
            .jpeg({
            quality: 95,
            mozjpeg: true,
            chromaSubsampling: '4:4:4',
        })
            .toBuffer();
        return finalBuffer;
    }
    /**
     * Helper to position the branding badge relative to the 1024x1024 canvas
     */
    calculateCornerCoordinates(position, canvasW, canvasH, badgeW, badgeH, margin) {
        switch (position) {
            case 'top-left':
                return { top: margin, left: margin };
            case 'bottom-right':
                return { top: canvasH - badgeH - margin, left: canvasW - badgeW - margin };
            case 'bottom-left':
                return { top: canvasH - badgeH - margin, left: margin };
            case 'top-right':
            default:
                return { top: margin, left: canvasW - badgeW - margin };
        }
    }
    /**
     * Creates a synthetic demo/test image for automated tests or dry runs
     */
    async createSyntheticProductImage(text) {
        const svg = `
    <svg width="600" height="600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="brickGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#C0392B"/>
          <stop offset="100%" stop-color="#7B241C"/>
        </radialGradient>
      </defs>
      <rect width="600" height="600" fill="#EAECEE"/>
      <g transform="translate(100, 150)">
        <rect width="400" height="240" rx="8" fill="url(#brickGrad)" stroke="#511812" stroke-width="6"/>
        <text x="200" y="130" fill="#FFFFFF" font-size="28" font-weight="bold" text-anchor="middle" font-family="sans-serif">${text}</text>
      </g>
    </svg>`;
        return (0, sharp_1.default)(Buffer.from(svg)).png().toBuffer();
    }
}
exports.SharpService = SharpService;
exports.sharpService = new SharpService();
//# sourceMappingURL=sharp.service.js.map