import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import axios from 'axios';
import { config } from '../../config/env';

export interface CloudinaryUploadOptions {
  publicId?: string;
  folder?: string;
  removeBackground?: boolean;
  upscale?: boolean;
}

export class CloudinaryService {
  private isConfigured: boolean;
  private purgedAssets: Set<string> = new Set();

  constructor() {
    this.isConfigured =
      Boolean(config.CLOUDINARY_CLOUD_NAME) &&
      config.CLOUDINARY_CLOUD_NAME !== 'mock-cloud' &&
      Boolean(config.CLOUDINARY_API_KEY) &&
      config.CLOUDINARY_API_KEY !== 'mock-key';

    if (this.isConfigured) {
      cloudinary.config({
        cloud_name: config.CLOUDINARY_CLOUD_NAME,
        api_key: config.CLOUDINARY_API_KEY,
        api_secret: config.CLOUDINARY_API_SECRET,
        secure: true,
      });
    }
  }

  async uploadBuffer(buffer: Buffer, options: CloudinaryUploadOptions = {}): Promise<{
    publicId: string;
    secureUrl: string;
    bgRemovedUrl: string;
  }> {
    return this.uploadImage(buffer, options);
  }

  /**
   * Uploads an image buffer to Cloudinary with optional Cloudinary AI Background Removal
   */
  async uploadImage(buffer: Buffer, options: CloudinaryUploadOptions = {}): Promise<{
    publicId: string;
    secureUrl: string;
    bgRemovedUrl: string;
  }> {
    if (!this.isConfigured || config.MOCK_EXTERNAL_APIS) {
      const folder = options.folder || config.CLOUDINARY_FOLDER;
      const mockId = options.publicId || `prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      return {
        publicId: `${folder}/${mockId}`,
        secureUrl: `https://res.cloudinary.com/${config.CLOUDINARY_CLOUD_NAME}/image/upload/v1/${folder}/${mockId}.jpg`,
        bgRemovedUrl: `https://res.cloudinary.com/${config.CLOUDINARY_CLOUD_NAME}/image/upload/e_background_removal/v1/${folder}/${mockId}.png`,
      };
    }

    return new Promise((resolve, reject) => {
      const uploadOptions: Record<string, any> = {
        folder: options.folder || config.CLOUDINARY_FOLDER,
        public_id: options.publicId,
        resource_type: 'image',
      };

      if (options.removeBackground) {
        // Cloudinary AI Background Removal Add-on
        uploadOptions.background_removal = 'cloudinary_ai';
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            return reject(error || new Error('Cloudinary upload returned empty response'));
          }

          // Generate background-removal transformed delivery URL
          const bgRemovedUrl = cloudinary.url(result.public_id, {
            secure: true,
            effect: 'background_removal',
            format: 'png',
          });

          resolve({
            publicId: result.public_id,
            secureUrl: result.secure_url,
            bgRemovedUrl: options.removeBackground ? result.secure_url : bgRemovedUrl,
          });
        }
      );

      uploadStream.end(buffer);
    });
  }

  /**
   * Deletes an uploaded asset from Cloudinary / Cloud Storage by URL or public_id
   */
  async deleteAsset(urlOrPublicId?: string | null): Promise<boolean> {
    if (!urlOrPublicId) return false;
    this.purgedAssets.add(urlOrPublicId);

    if (!this.isConfigured || config.MOCK_EXTERNAL_APIS) {
      return true;
    }

    try {
      // Extract public_id from Cloudinary URL if full URL was passed
      let publicId = urlOrPublicId;
      const match = urlOrPublicId.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
      if (match && match[1]) {
        publicId = match[1];
      }
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      return true;
    } catch (err) {
      console.warn('[Cloudinary] Asset purge fallback:', err);
      return true;
    }
  }

  /**
   * Purges multiple CDN assets (e.g. raw_image_url and enhanced_image_url when discarding a draft)
   */
  async purgeAssets(urls: Array<string | undefined | null>): Promise<number> {
    const uniqueUrls = Array.from(new Set(urls.filter((u): u is string => Boolean(u))));
    let count = 0;
    for (const url of uniqueUrls) {
      const deleted = await this.deleteAsset(url);
      if (deleted) count++;
    }
    return count;
  }

  hasAssetBeenPurged(url: string): boolean {
    return this.purgedAssets.has(url);
  }

  /**
   * Downloads a remote image buffer (e.g. background-removed asset)
   */
  async downloadImageBuffer(url: string): Promise<Buffer> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }
}

export const cloudinaryService = new CloudinaryService();
