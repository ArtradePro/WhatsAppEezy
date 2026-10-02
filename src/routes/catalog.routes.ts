import { Router } from 'express';
import { catalogController } from '../controllers/catalog.controller';

const router = Router();

router.get('/', (req, res, next) => {
  catalogController.listProducts(req, res, next);
});

router.get('/:id', (req, res, next) => {
  catalogController.getProductById(req, res, next);
});

router.post('/:id/resync', (req, res, next) => {
  catalogController.resyncProduct(req, res, next);
});

export const catalogRouter = router;
