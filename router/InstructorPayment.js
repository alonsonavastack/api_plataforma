import express from 'express';
import {
    getPaymentConfig,
    updatePaypalConfig,
    updateBankConfig,
    updatePreferredPaymentMethod,
    getEarnings,
    getEarningsStats,
    getPaymentHistory
} from '../controllers/InstructorPaymentController.js';
import auth from '../service/auth.js';

const router = express.Router();

/**
 * RUTAS PARA INSTRUCTORES - GESTIÓN DE PAGOS
 * Todas las rutas requieren autenticación y rol de instructor
 */

// ========================================
// CONFIGURACIÓN DE PAGOS
// ========================================

/**
 * @route   GET /api/instructor/payment-config
 * @desc    Obtener configuración de pago del instructor
 * @access  Private (Instructor)
 */
router.get('/payment-config', auth.verifyInstructor, getPaymentConfig);

/**
 * @route   POST /api/instructor/payment-config/paypal
 * @desc    Conectar/actualizar cuenta de PayPal
 * @access  Private (Instructor)
 */
router.post('/payment-config/paypal', auth.verifyInstructor, updatePaypalConfig);

/**
 * @route   POST /api/instructor/payment-config/bank
 * @desc    Agregar/actualizar cuenta bancaria
 * @access  Private (Instructor)
 */
router.post('/payment-config/bank', auth.verifyInstructor, updateBankConfig);

/**
 * @route   PUT /api/instructor/payment-config
 * @desc    Actualizar método de pago preferido
 * @access  Private (Instructor)
 */
router.put('/payment-config', auth.verifyInstructor, updatePreferredPaymentMethod);

// ========================================
// GANANCIAS (EARNINGS)
// ========================================

/**
 * @route   GET /api/instructor/earnings
 * @desc    Obtener lista de ganancias del instructor
 * @query   ?status=pending|available|paid&startDate=&endDate=&page=1&limit=20
 * @access  Private (Instructor)
 */
router.get('/earnings', auth.verifyInstructor, getEarnings);

/**
 * @route   GET /api/instructor/earnings/stats
 * @desc    Obtener estadísticas de ganancias
 * @access  Private (Instructor)
 */
router.get('/earnings/stats', auth.verifyInstructor, getEarningsStats);

// ========================================
// HISTORIAL DE PAGOS
// ========================================

/**
 * @route   GET /api/instructor/payments/history
 * @desc    Obtener historial de pagos recibidos
 * @query   ?page=1&limit=10
 * @access  Private (Instructor)
 */
router.get('/payments/history', auth.verifyInstructor, getPaymentHistory);

export default router;
