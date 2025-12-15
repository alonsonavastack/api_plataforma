import express from 'express';
import LogController from '../controllers/LogController.js';
import auth from '../service/auth.js';

const router = express.Router();

// 📊 Obtener logs (solo admin)
router.get('/list', auth.verifyAdmin, LogController.list);

// 📈 Obtener estadísticas (solo admin)
router.get('/stats', auth.verifyAdmin, LogController.stats);

// 🗑️ Limpiar logs antiguos (solo admin)
router.post('/clear', auth.verifyAdmin, LogController.clear);

// 📍 Registrar visita de página (usuarios autenticados)
router.post('/page-visit', auth.verifyDashboard, LogController.logPageVisit);

export default router;
