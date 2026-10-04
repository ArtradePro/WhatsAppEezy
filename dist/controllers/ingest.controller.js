"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestController = exports.IngestController = void 0;
const zod_1 = require("zod");
const ingestion_orchestrator_1 = require("../services/pipeline/ingestion-orchestrator");
// Schema for multipart form fields
const intakeSchema = zod_1.z.object({
    title: zod_1.z.string().min(2, 'Title must be at least 2 characters long').max(200),
    unit_price: zod_1.z.coerce.number().positive('Unit price must be greater than 0'),
    description: zod_1.z.string().min(5, 'Description must be at least 5 characters long'),
    currency: zod_1.z.string().length(3).optional(),
    supplier_id: zod_1.z.string().optional(),
    retailer_id: zod_1.z.string().optional(),
    brand: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    condition: zod_1.z.enum(['new', 'refurbished', 'used']).optional(),
    availability: zod_1.z.enum(['in stock', 'out of stock', 'preorder', 'available for order']).optional(),
});
class IngestController {
    async handleIntake(req, res, next) {
        try {
            // 1. Verify file presence
            if (!req.file) {
                res.status(400).json({
                    success: false,
                    error: 'BadRequest',
                    message: 'Missing product image file. Please provide an image under the "image" field.',
                });
                return;
            }
            // 2. Validate multipart form fields
            const validatedBody = intakeSchema.parse(req.body);
            // 3. Trigger automated processing pipeline
            const result = await ingestion_orchestrator_1.ingestionOrchestrator.ingestSupplierProduct(req.file.buffer, {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
            }, {
                title: validatedBody.title,
                unitPrice: validatedBody.unit_price,
                currency: validatedBody.currency,
                description: validatedBody.description,
                supplierId: validatedBody.supplier_id,
                retailerId: validatedBody.retailer_id,
                brand: validatedBody.brand,
                category: validatedBody.category,
                condition: validatedBody.condition,
                availability: validatedBody.availability,
            });
            const httpStatus = result.status === 'SUCCESS' ? 201 : 207; // 207 Multi-Status if partial
            res.status(httpStatus).json(result);
        }
        catch (error) {
            next(error);
        }
    }
}
exports.IngestController = IngestController;
exports.ingestController = new IngestController();
//# sourceMappingURL=ingest.controller.js.map