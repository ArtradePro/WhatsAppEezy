"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const storage = multer_1.default.memoryStorage();
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error(`Unsupported image format: ${file.mimetype}. Allowed formats: JPEG, PNG, WEBP.`));
    }
};
exports.upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 15 * 1024 * 1024, // 15MB max file size
    },
    fileFilter,
});
//# sourceMappingURL=upload.middleware.js.map