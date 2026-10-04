"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const multer_1 = __importDefault(require("multer"));
function errorHandler(err, req, res, next) {
    console.error('Unhandled Application Error:', err);
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: err.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            })),
        });
        return;
    }
    if (err instanceof multer_1.default.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
                success: false,
                error: 'File too large',
                message: 'Maximum allowed image file size is 15MB.',
            });
            return;
        }
        res.status(400).json({
            success: false,
            error: 'File upload error',
            message: err.message,
        });
        return;
    }
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        error: err.name || 'InternalServerError',
        message: err.message || 'An unexpected server error occurred',
    });
}
//# sourceMappingURL=error.middleware.js.map