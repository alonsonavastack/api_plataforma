/**
 * 🌍 RUTAS FISCALES
 * 
 * Endpoints para gestión fiscal y dashboard de ganancias
 * 
 * @version 1.0.0
 * @date 27 de Octubre, 2025
 */

import express from 'express';
import FiscalController from '../controllers/FiscalController.js';
import auth from '../service/auth.js';

const router = express.Router();

// ====================================================================
// 📊 DASHBOARD DE GANANCIAS
// ====================================================================

/**
 * GET /api/fiscal/my-earnings
 * Obtiene las ganancias del instructor autenticado
 * Requiere: Instructor autenticado
 */
router.get('/my-earnings', auth.verifyInstructor, FiscalController.getMyEarnings);

/**
 * GET /api/fiscal/all-earnings
 * Obtiene TODAS las ganancias de TODOS los instructores
 * Requiere: Admin
 */
router.get('/all-earnings', auth.verifyAdmin, FiscalController.getAllEarnings);

// ====================================================================
// ⚙️ CONFIGURACIÓN FISCAL
// ====================================================================

/**
 * GET /api/fiscal/my-config
 * Obtiene la configuración fiscal del instructor autenticado
 * Requiere: Instructor autenticado
 */
router.get('/my-config', auth.verifyInstructor, FiscalController.getMyFiscalConfig);

/**
 * PUT /api/fiscal/update-config
 * Actualiza la configuración fiscal del instructor
 * Requiere: Instructor autenticado
 */
router.put('/update-config', auth.verifyInstructor, FiscalController.updateFiscalConfig);

// ====================================================================
// 🌍 INFORMACIÓN DE PAÍSES
// ====================================================================

/**
 * GET /api/fiscal/countries
 * Lista todos los países soportados
 * Requiere: Autenticado
 */
router.get('/countries', auth.verifyDashboard, FiscalController.getSupportedCountries);

/**
 * GET /api/fiscal/country-config/:code
 * Obtiene la configuración completa de un país
 * Requiere: Autenticado
 */
router.get('/country-config/:code', auth.verifyDashboard, FiscalController.getCountryConfig);

// ====================================================================
// 💰 GESTIÓN DE PAGOS (ADMIN)
// ====================================================================

/**
 * PUT /api/fiscal/mark-as-paid
 * Marca una ganancia como pagada
 * Requiere: Admin
 */
router.put('/mark-as-paid', auth.verifyAdmin, FiscalController.markAsPaid);

export default router;
