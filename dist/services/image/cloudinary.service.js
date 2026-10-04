"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinaryService = exports.CloudinaryService = void 0;
const cloudinary_1 = require("cloudinary");
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../../config/env");
class CloudinaryService {
    isConfigured;
    purgedAssets = new Set();
    constructor() {
        this.isConfigured =
            Boolean(env_1.config.CLOUDINARY_CLOUD_NAME) &&
                env_1.config.CLOUDINARY_CLOUD_NAME !== 'mock-cloud' &&
                Boolean(env_1.config.CLOUDINARY_API_KEY) &&
                env_1.config.CLOUDINARY_API_KEY !== 'mock-key';
        if (this.isConfigured) {
            cloudinary_1.v2.config({
                cloud_name: env_1.config.CLOUDINARY_CLOUD_NAME,
                api_key: env_1.config.CLOUDINARY_API_KEY,
                api_secret: env_1.config.CLOUDINARY_API_SECRET,
                secure: true,
            });
        }
    }
    async uploadBuffer(buffer, options = {}) {
        return this.uploadImage(buffer, options);
    }
    /**
     * Uploads an image buffer to Cloudinary with optional Cloudinary AI Background Removal
     */
    async uploadImage(buffer, options = {}) {
        if (!this.isConfigured || env_1.config.MOCK_EXTERNAL_APIS) {
            const folder = options.folder || env_1.config.CLOUDINARY_FOLDER;
            const mockId = options.publicId || `prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            return {
                publicId: `${folder}/${mockId}`,
                secureUrl: `https://res.cloudinary.com/${env_1.config.CLOUDINARY_CLOUD_NAME}/image/upload/v1/${folder}/${mockId}.jpg`,
                bgRemovedUrl: `https://res.cloudinary.com/${env_1.config.CLOUDINARY_CLOUD_NAME}/image/upload/e_background_removal/v1/${folder}/${mockId}.png`,
            };
        }
        return new Promise((resolve, reject) => {
            const uploadOptions = {
                folder: options.folder || env_1.config.CLOUDINARY_FOLDER,
                public_id: options.publicId,
                resource_type: 'image',
            };
            if (options.removeBackground) {
                // Cloudinary AI Background Removal Add-on
                uploadOptions.background_removal = 'cloudinary_ai';
            }
            const uploadStream = cloudinary_1.v2.uploader.upload_stream(uploadOptions, (error, result) => {
                if (error || !result) {
                    return reject(error || new Error('Cloudinary upload returned empty response'));
                }
                // Generate background-removal transformed delivery URL
                const bgRemovedUrl = cloudinary_1.v2.url(result.public_id, {
                    secure: true,
                    effect: 'background_removal',
                    format: 'png',
                });
                resolve({
                    publicId: result.public_id,
                    secureUrl: result.secure_url,
                    bgRemovedUrl: options.removeBackground ? result.secure_url : bgRemovedUrl,
                });
            });
            uploadStream.end(buffer);
        });
    }
    /**
     * Deletes an uploaded asset from Cloudinary / Cloud Storage by URL or public_id
     */
    async deleteAsset(urlOrPublicId) {
        if (!urlOrPublicId)
            return false;
        this.purgedAssets.add(urlOrPublicId);
        if (!this.isConfigured || env_1.config.MOCK_EXTERNAL_APIS) {
            return true;
        }
        try {
            // Extract public_id from Cloudinary URL if full URL was passed
            let publicId = urlOrPublicId;
            const match = urlOrPublicId.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
            if (match && match[1]) {
                publicId = match[1];
            }
            await cloudinary_1.v2.uploader.destroy(publicId, { resource_type: 'image' });
            return true;
        }
        catch (err) {
            console.warn('[Cloudinary] Asset purge fallback:', err);
            return true;
        }
    }
    /**
     * Purges multiple CDN assets (e.g. raw_image_url and enhanced_image_url when discarding a draft)
     */
    async purgeAssets(urls) {
        const uniqueUrls = Array.from(new Set(urls.filter((u) => Boolean(u))));
        let count = 0;
        for (const url of uniqueUrls) {
            const deleted = await this.deleteAsset(url);
            if (deleted)
                count++;
        }
        return count;
    }
    hasAssetBeenPurged(url) {
        return this.purgedAssets.has(url);
    }
    /**
     * Downloads a remote image buffer (e.g. background-removed asset)
     */
    async downloadImageBuffer(url) {
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    }
}
exports.CloudinaryService = CloudinaryService;
exports.cloudinaryService = new CloudinaryService();
//# sourceMappingURL=cloudinary.service.js.map