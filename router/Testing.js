import express from 'express';
import TestingController from '../controllers/TestingController.js';

const router = express.Router();

/**
 * 🧪 RUTAS DE TESTING - SOLO DESARROLLO
 * ⚠️ IMPORTANTE: Deshabilitar en producción
 */

// 🌎 PROBAR CONVERSIÓN PARA TODOS LOS PAÍSES
// GET /api/testing/test-conversion?amount=50
router.get('/test-conversion', TestingController.testConversionAllCountries);

// 💳 SIMULAR PREFERENCIA DE MERCADOPAGO
// POST /api/testing/simulate-preference
// Body: { country: 'AR', amount: 50, product_name: 'Curso de Testing' }
router.post('/simulate-preference', TestingController.simulateMercadoPagoPreference);

// 🏦 SIMULAR TRANSFERENCIA
// POST /api/testing/simulate-transfer
// Body: { country: 'BR', amount: 50 }
router.post('/simulate-transfer', TestingController.simulateTransfer);

// 📊 COMPARAR PRECIOS EN TODOS LOS PAÍSES
// GET /api/testing/compare-prices?amount=50
router.get('/compare-prices', TestingController.comparePrices);

export default router;
