import { Router } from 'express';
import { upload } from '../middleware/upload.middleware';
import { ingestController } from '../controllers/ingest.controller';

const router = Router();

/**
 * @route   POST /api/v1/products/ingest
 * @desc    Accepts multipart/form-data containing supplier product image, title, unit price, and description.
 *          Performs image enhancement (Sharp + Cloudinary AI bg removal, 1024x1024 white canvas + corner branding),
 *          AI vision attribute extraction (GPT-4o / Claude 3.5 Sonnet), and Meta Graph API v19.0 Catalog upsert.
 */
router.post('/ingest', upload.single('image'), (req, res, next) => {
  ingestController.handleIntake(req, res, next);
});

export const ingestRouter = router;
