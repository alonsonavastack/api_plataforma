import express from 'express';
import MercadoPagoController from '../controllers/MercadoPagoController.js';
import auth from '../service/auth.js';

const router = express.Router();

router.post('/create-preference', auth.verifyDashboard, MercadoPagoController.createPreference);
router.post('/webhook', MercadoPagoController.webhook);
router.post('/simulate-webhook', auth.verifyDashboard, MercadoPagoController.simulateWebhook); // 🔧 TEMPORAL
router.get('/payment/:payment_id', auth.verifyDashboard, MercadoPagoController.getPaymentStatus);
router.post('/verify-payment', auth.verifyDashboard, MercadoPagoController.verifyPayment);

export default router;