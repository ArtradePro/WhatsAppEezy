"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestRouter = void 0;
const express_1 = require("express");
const upload_middleware_1 = require("../middleware/upload.middleware");
const ingest_controller_1 = require("../controllers/ingest.controller");
const router = (0, express_1.Router)();
/**
 * @route   POST /api/v1/products/ingest
 * @desc    Accepts multipart/form-data containing supplier product image, title, unit price, and description.
 *          Performs image enhancement (Sharp + Cloudinary AI bg removal, 1024x1024 white canvas + corner branding),
 *          AI vision attribute extraction (GPT-4o / Claude 3.5 Sonnet), and Meta Graph API v19.0 Catalog upsert.
 */
router.post('/ingest', upload_middleware_1.upload.single('image'), (req, res, next) => {
    ingest_controller_1.ingestController.handleIntake(req, res, next);
});
exports.ingestRouter = router;
//# sourceMappingURL=ingest.routes.js.map