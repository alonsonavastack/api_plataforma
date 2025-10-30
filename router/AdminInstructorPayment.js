import express from 'express';
import {
    getInstructorsWithEarnings,
    getInstructorEarnings,
    createPayment,
    processPayment,
    completePayment,
    getPaymentHistory,
    getCommissionSettings,
    updateCommissionSettings,
    setCustomCommission,
    removeCustomCommission,
    getEarningsReport,
    getInstructorPaymentMethodFull, // 🔥 Nuevo import
    verifyInstructorBank, // 🔥 Endpoint de verificación de cuenta bancaria
    getPendingBankVerifications // 🔔 Notificaciones de cuentas pendientes
} from '../controllers/AdminInstructorPaymentController.js';
import auth from '../service/auth.js';

const router = express.Router();

/**
 * RUTAS PARA ADMINISTRADORES - GESTIÓN DE PAGOS A INSTRUCTORES
 * Todas las rutas requieren autenticación y rol de administrador
 */

// ========================================
// GESTIÓN DE INSTRUCTORES Y GANANCIAS
// ========================================

/**
 * @route   GET /api/admin/instructors/payments
 * @desc    Obtener lista de instructores con ganancias disponibles
 * @query   ?status=available|pending|paid&minAmount=0
 * @access  Private (Admin)
 */
router.get('/instructors/payments', auth.verifyAdmin, getInstructorsWithEarnings);

/**
 * @route   GET /api/admin/instructors/:id/earnings
 * @desc    Obtener ganancias detalladas de un instructor específico
 * @query   ?status=all|pending|available|paid&startDate=&endDate=
 * @access  Private (Admin)
 */
router.get('/instructors/:id/earnings', auth.verifyAdmin, getInstructorEarnings);

/**
 * @route   GET /api/admin/instructors/:id/payment-method-full
 * @desc    🔥 NUEVO: Obtener datos bancarios COMPLETOS (sin encriptar) de un instructor
 * @desc    Este endpoint devuelve números de cuenta y CLABE completos para que el admin pueda procesar pagos
 * @access  Private (Admin ONLY)
 */
router.get('/instructors/:id/payment-method-full', auth.verifyAdmin, getInstructorPaymentMethodFull);

/**
 * @route   PUT /api/admin/instructors/:id/verify-bank
 * @desc    🔥 NUEVO: Verificar cuenta bancaria de un instructor
 * @access  Private (Admin ONLY)
 */
router.put('/instructors/:id/verify-bank', auth.verifyAdmin, verifyInstructorBank);

/**
 * @route   GET /api/admin/bank-verifications/pending
 * @desc    🔔 NUEVO: Obtener lista de cuentas bancarias pendientes de verificación (notificaciones)
 * @access  Private (Admin ONLY)
 */
router.get('/bank-verifications/pending', auth.verifyAdmin, getPendingBankVerifications);

// ========================================
// GESTIÓN DE PAGOS
// ========================================

/**
 * @route   POST /api/admin/instructors/:id/payment
 * @desc    Crear un nuevo pago para un instructor
 * @body    { earnings_ids: [], deductions: 0, notes: '' }
 * @access  Private (Admin)
 */
router.post('/instructors/:id/payment', auth.verifyAdmin, createPayment);

/**
 * @route   PUT /api/admin/payments/:id/process
 * @desc    Procesar un pago (marcar como processing)
 * @body    { transaction_id: '', receipt_url: '' }
 * @access  Private (Admin)
 */
router.put('/payments/:id/process', auth.verifyAdmin, processPayment);

/**
 * @route   PUT /api/admin/payments/:id/complete
 * @desc    Completar un pago (marcar como completed)
 * @access  Private (Admin)
 */
router.put('/payments/:id/complete', auth.verifyAdmin, completePayment);

/**
 * @route   GET /api/admin/payments
 * @desc    Obtener historial de todos los pagos
 * @query   ?status=all|pending|processing|completed&instructor=&page=1&limit=20
 * @access  Private (Admin)
 */
router.get('/payments', auth.verifyAdmin, getPaymentHistory);

// ========================================
// CONFIGURACIÓN DE COMISIONES
// ========================================

/**
 * @route   GET /api/admin/commission-settings
 * @desc    Obtener configuración de comisiones de la plataforma
 * @access  Private (Admin)
 */
router.get('/commission-settings', auth.verifyAdmin, getCommissionSettings);

/**
 * @route   PUT /api/admin/commission-settings
 * @desc    Actualizar configuración global de comisiones
 * @body    { default_commission_rate, days_until_available, minimum_payment_threshold, exchange_rate }
 * @access  Private (Admin)
 */
router.put('/commission-settings', auth.verifyAdmin, updateCommissionSettings);

/**
 * @route   POST /api/admin/commission-settings/custom
 * @desc    Establecer comisión personalizada para un instructor
 * @body    { instructor_id, commission_rate, reason }
 * @access  Private (Admin)
 */
router.post('/commission-settings/custom', auth.verifyAdmin, setCustomCommission);

/**
 * @route   DELETE /api/admin/commission-settings/custom/:instructorId
 * @desc    Eliminar comisión personalizada de un instructor
 * @access  Private (Admin)
 */
router.delete('/commission-settings/custom/:instructorId', auth.verifyAdmin, removeCustomCommission);

// ========================================
// REPORTES
// ========================================

/**
 * @route   GET /api/admin/earnings/report
 * @desc    Obtener reporte de ganancias y comisiones
 * @query   ?period=today|week|month|year|all&startDate=&endDate=
 * @access  Private (Admin)
 */
router.get('/earnings/report', auth.verifyAdmin, getEarningsReport);

export default router;
