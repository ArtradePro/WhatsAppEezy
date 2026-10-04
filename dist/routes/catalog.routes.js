"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogRouter = void 0;
const express_1 = require("express");
const catalog_controller_1 = require("../controllers/catalog.controller");
const router = (0, express_1.Router)();
router.get('/', (req, res, next) => {
    catalog_controller_1.catalogController.listProducts(req, res, next);
});
router.get('/:id', (req, res, next) => {
    catalog_controller_1.catalogController.getProductById(req, res, next);
});
router.post('/:id/resync', (req, res, next) => {
    catalog_controller_1.catalogController.resyncProduct(req, res, next);
});
exports.catalogRouter = router;
//# sourceMappingURL=catalog.routes.js.map