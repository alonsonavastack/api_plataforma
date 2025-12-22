import routerx from 'express-promise-router';
import TaxBreakdownController from '../controllers/TaxBreakdownController.js';
import auth from '../service/auth.js';

const router = routerx();

// GET /api/admin/tax-breakdown/sales
router.get('/sales', [auth.verifyAdmin], TaxBreakdownController.getSalesBreakdown);

// POST /api/admin/tax-breakdown/generate-cfdi
router.post('/generate-cfdi', [auth.verifyAdmin], TaxBreakdownController.generateCFDI);

// POST /api/admin/tax-breakdown/resend-cfdi
router.post('/resend-cfdi', [auth.verifyAdmin], TaxBreakdownController.resendCFDI);

// GET /api/admin/tax-breakdown/pending-count
router.get('/pending-count', [auth.verifyAdmin], TaxBreakdownController.getPendingCount);

// GET /api/admin/tax-breakdown/export
router.get('/export', [auth.verifyAdmin], TaxBreakdownController.exportRetentions);

export default router;
