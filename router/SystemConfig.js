import express from 'express';
import auth from '../service/auth.js';
import * as SystemConfigController from '../controllers/SystemConfigController.js';
import multiparty from 'connect-multiparty';

const router = express.Router();
// 🔥 Configuración de multiparty con límites más amplios
const multipartyMiddleware = multiparty({ 
  uploadDir: './uploads/system',
  maxFilesSize: 10 * 1024 * 1024, // 10MB máximo por archivo
  maxFields: 50, // Más campos permitidos
  autoFiles: true
});

// Rutas de configuración del sistema
router.get('/get', auth.verifyAdmin, SystemConfigController.get); // Solo admin
router.get('/get-public', SystemConfigController.getPublic); // Público
router.get('/debug', SystemConfigController.debug); // 🔍 DEBUG temporal
router.put('/update', [auth.verifyAdmin, multipartyMiddleware], SystemConfigController.update);

// Rutas públicas para obtener imágenes
router.get('/logo/:img', SystemConfigController.getLogo);
router.get('/favicon/:img', SystemConfigController.getFavicon);

export default router;