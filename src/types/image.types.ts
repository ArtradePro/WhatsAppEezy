export type CornerPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface CanvasProcessingOptions {
  /** Target canvas width (default: 1024) */
  targetWidth?: number;
  /** Target canvas height (default: 1024) */
  targetHeight?: number;
  /** Inner content max bounding size before padding (default: 880) */
  innerMaxDimension?: number;
  /** Background color object or hex (default pure white #FFFFFF) */
  backgroundColor?: { r: number; g: number; b: number; alpha: number };
  /** Brand text to display in corner badge (e.g. 'CargoDash Verified') */
  brandName?: string;
  /** Corner location for branding (default: 'top-right') */
  cornerPosition?: CornerPosition;
  /** Custom logo buffer if provided */
  customLogoBuffer?: Buffer;
}

export interface ImageProcessingResult {
  /** Original image buffer */
  originalBuffer: Buffer;
  /** Original file metadata */
  originalMeta: {
    format: string;
    width: number;
    height: number;
    sizeBytes: number;
  };
  /** Cloudinary URL for original upload */
  originalUrl: string;
  /** Background-removed asset URL */
  backgroundRemovedUrl: string;
  /** Final 1024x1024 white padded canvas buffer */
  enhancedBuffer: Buffer;
  /** Cloudinary URL for final enhanced asset */
  enhancedUrl: string;
  /** Dimensions of final enhanced asset */
  finalDimensions: {
    width: number;
    height: number;
  };
}
