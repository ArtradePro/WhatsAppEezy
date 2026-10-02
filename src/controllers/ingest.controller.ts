import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ingestionOrchestrator } from '../services/pipeline/ingestion-orchestrator';

// Schema for multipart form fields
const intakeSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters long').max(200),
  unit_price: z.coerce.number().positive('Unit price must be greater than 0'),
  description: z.string().min(5, 'Description must be at least 5 characters long'),
  currency: z.string().length(3).optional(),
  supplier_id: z.string().optional(),
  retailer_id: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  condition: z.enum(['new', 'refurbished', 'used']).optional(),
  availability: z.enum(['in stock', 'out of stock', 'preorder', 'available for order']).optional(),
});

export class IngestController {
  async handleIntake(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      const result = await ingestionOrchestrator.ingestSupplierProduct(
        req.file.buffer,
        {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
        {
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
        }
      );

      const httpStatus = result.status === 'SUCCESS' ? 201 : 207; // 207 Multi-Status if partial
      res.status(httpStatus).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const ingestController = new IngestController();
