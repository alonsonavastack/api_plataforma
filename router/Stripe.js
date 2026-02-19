import routerx from 'express-promise-router';
import {
    startOnboarding,
    onboardingSuccess,
    getStripeStatus,
    getStripeDashboardLink,
    stripeWebhook
} from '../controllers/StripeConnectController.js';
import auth from '../service/auth.js';
import express from 'express';

const router = routerx();

/**
 * RUTAS STRIPE CONNECT
 * 
 * 🔔 IMPORTANTE: El webhook debe ir ANTES de cualquier middleware que parsee JSON
 * porque Stripe necesita el body RAW para verificar la firma
 */

// 🔔 WEBHOOK - Recibe eventos de Stripe (body RAW, sin auth JWT)
router.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// 🔗 Iniciar vinculación - El instructor hace clic en "Conectar con Stripe"
// POST /api/stripe/connect/onboard
router.post('/connect/onboard', auth, startOnboarding);

// ✅ Stripe redirige aquí después del onboarding exitoso
// GET /api/stripe/connect/success
router.get('/connect/success', auth, onboardingSuccess);

// 📊 Consultar estado de la cuenta Stripe del instructor
// GET /api/stripe/connect/status
router.get('/connect/status', auth, getStripeStatus);

// 🔗 Obtener link al dashboard de Stripe (para que el instructor vea sus pagos)
// GET /api/stripe/connect/dashboard
router.get('/connect/dashboard', auth, getStripeDashboardLink);

export default router;
