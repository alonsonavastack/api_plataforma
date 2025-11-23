// router/Transfer.js
// 🏦 RUTAS PARA VERIFICACIÓN DE TRANSFERENCIAS BANCARIAS

import routerx from 'express-promise-router';
import TransferVerificationController from '../controllers/TransferVerificationController.js';
import auth from '../service/auth.js';
import multiparty from 'connect-multiparty';

const router = routerx();
const multiparty_upload = multiparty({ uploadDir: './uploads/transfers' });

/**
 * 📋 LISTAR TRANSFERENCIAS
 * GET /api/transfers/pending - Solo transferencias pendientes
 * GET /api/transfers/pending?status=Pagado - Transferencias pagadas
 * GET /api/transfers/pending?dateFrom=2024-01-01&dateTo=2024-12-31
 */
router.get('/pending', 
  auth.verifyAdmin, 
  TransferVerificationController.listPendingTransfers
);

/**
 * ✅ VERIFICAR Y APROBAR TRANSFERENCIA
 * POST /api/transfers/verify/:id
 * Body (multipart/form-data):
 *   - receipt: archivo (PDF, imagen) [OPCIONAL]
 *   - verification_notes: string [OPCIONAL]
 * 
 * Proceso automático:
 * 1. Cambia status a "Pagado"
 * 2. Guarda comprobante del admin
 * 3. Inscribe automáticamente en cursos
 * 4. Crea ganancias para instructores
 * 5. Envía notificación al estudiante
 */
router.post('/verify/:id', 
  [auth.verifyAdmin, multiparty_upload], 
  TransferVerificationController.verifyTransfer
);

/**
 * 🔄 RECHAZAR TRANSFERENCIA
 * POST /api/transfers/reject/:id
 * Body: { rejection_reason: string }
 */
router.post('/reject/:id', 
  auth.verifyAdmin, 
  TransferVerificationController.rejectTransfer
);

/**
 * 📄 OBTENER COMPROBANTE DE TRANSFERENCIA
 * GET /api/transfers/receipt/:filename
 * Público (con token) - Para que estudiantes vean su comprobante
 */
router.get('/receipt/:filename', 
  auth.verifyToken, 
  TransferVerificationController.getReceipt
);

/**
 * 📊 ESTADÍSTICAS DE TRANSFERENCIAS
 * GET /api/transfers/stats
 * Retorna: { pending: {count, amount}, paid: {count, amount}, cancelled: {count, amount} }
 */
router.get('/stats', 
  auth.verifyAdmin, 
  TransferVerificationController.getStats
);

export default router;
