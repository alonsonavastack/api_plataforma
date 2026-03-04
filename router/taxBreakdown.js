import routerx from 'express-promise-router';
import TaxBreakdownController from '../controllers/TaxBreakdownController.js';
import auth from '../service/auth.js';

const router = routerx();

router.get('/sales', [auth.verifyAdmin], TaxBreakdownController.getSalesBreakdown);
router.get('/summary', [auth.verifyAdmin], TaxBreakdownController.getSummary);
router.get('/export', [auth.verifyAdmin], TaxBreakdownController.exportRetentions);
router.post('/generate-cfdi', [auth.verifyAdmin], TaxBreakdownController.generateCFDI);
router.post('/resend-cfdi', [auth.verifyAdmin], TaxBreakdownController.resendCFDI);
router.get('/pending-count', [auth.verifyAdmin], TaxBreakdownController.getPendingCount);

export default router;
