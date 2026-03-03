import routerx from 'express-promise-router';
import {
    startOnboarding,
    onboardingSuccess,
    getStripeStatus,
    getStripeDashboardLink
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

// 🔔 WEBHOOK - Movido a index.js para procesar body RAW adecuadamente

// 🔗 Iniciar vinculación - El instructor hace clic en "Conectar con Stripe"
// POST /api/stripe/connect/onboard
router.post('/connect/onboard', auth.verifyInstructor, startOnboarding);

// ✅ Stripe redirige aquí después del onboarding exitoso
// GET /api/stripe/connect/success
router.get('/connect/success', auth.verifyInstructor, onboardingSuccess);

// 📊 Consultar estado de la cuenta Stripe del instructor
// GET /api/stripe/connect/status
router.get('/connect/status', auth.verifyInstructor, getStripeStatus);

// 🔗 Obtener link al dashboard de Stripe (para que el instructor vea sus pagos)
// GET /api/stripe/connect/dashboard
router.get('/connect/dashboard', auth.verifyInstructor, getStripeDashboardLink);

// 🗑️ Desvincular cuenta Stripe
// DELETE /api/stripe/connect/disconnect
import { disconnectStripe } from '../controllers/StripeConnectController.js';
router.delete('/connect/disconnect', auth.verifyInstructor, disconnectStripe);

export default router;
