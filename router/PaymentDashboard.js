// router/PaymentDashboard.js
// 📊 RUTAS PARA DASHBOARD DE ADMINISTRACIÓN DE PAGOS

import routerx from 'express-promise-router';
import PaymentDashboardController from '../controllers/PaymentDashboardController.js';
import auth from '../service/auth.js';

const router = routerx();

/**
 * 📊 ESTADÍSTICAS GENERALES DEL DASHBOARD
 * GET /api/payment-dashboard/stats
 * Retorna: ventas por estado, métodos de pago, billeteras, alertas
 */
router.get('/stats', 
  auth.verifyAdmin, 
  PaymentDashboardController.getGeneralStats
);

/**
 * 📋 LISTAR TODAS LAS VENTAS CON FILTROS
 * GET /api/payment-dashboard/sales
 * Query params:
 *   - status: 'Pendiente' | 'Pagado' | 'Cancelado'
 *   - method_payment: 'transfer' | 'wallet' | 'paypal' | etc.
 *   - dateFrom: '2024-01-01'
 *   - dateTo: '2024-12-31'
 *   - userId: ObjectId del usuario
 *   - search: texto para buscar por nombre/email/transacción
 *   - page: número de página (default: 1)
 *   - limit: items por página (default: 20)
 */
router.get('/sales', 
  auth.verifyAdmin, 
  PaymentDashboardController.listSales
);

/**
 * 📈 ANÁLISIS DE MÉTODOS DE PAGO
 * GET /api/payment-dashboard/payment-methods-analysis
 * Query: months (default: 6)
 */
router.get('/payment-methods-analysis', 
  auth.verifyAdmin, 
  PaymentDashboardController.getPaymentMethodsAnalysis
);

/**
 * 💰 ESTADÍSTICAS DE BILLETERAS
 * GET /api/payment-dashboard/wallets-stats
 */
router.get('/wallets-stats', 
  auth.verifyAdmin, 
  PaymentDashboardController.getWalletsStats
);

/**
 * 🔄 RESUMEN DE REEMBOLSOS
 * GET /api/payment-dashboard/refunds-summary
 */
router.get('/refunds-summary', 
  auth.verifyAdmin, 
  PaymentDashboardController.getRefundsSummary
);

/**
 * 📤 EXPORTAR VENTAS A CSV
 * GET /api/payment-dashboard/export-sales
 * Query: status, method_payment, dateFrom, dateTo
 */
router.get('/export-sales', 
  auth.verifyAdmin, 
  PaymentDashboardController.exportSales
);

export default router;
