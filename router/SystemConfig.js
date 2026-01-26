import express from 'express';
import auth from '../service/auth.js';
import * as SystemConfigController from '../controllers/SystemConfigController.js';
import * as BackupController from '../controllers/BackupController.js';
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
// 🗑️ ELIMINADO: /debug - Era temporal para debugging
router.put('/update', [auth.verifyAdmin, multipartyMiddleware], SystemConfigController.update);

// Rutas públicas para obtener imágenes
router.get('/logo/:img', SystemConfigController.getLogo);
router.get('/favicon/:img', SystemConfigController.getFavicon);

// 🌎 RUTA PÚBLICA: Obtener países soportados para pagos
router.get('/supported-countries', SystemConfigController.getSupportedCountriesEndpoint);

// 📦 RESPALDO: Descarga manual (Solo Admin)
router.get('/backup/download', auth.verifyAdmin, BackupController.download);
router.get('/backup/test', BackupController.test); // Test route (no auth for easier check)
router.post('/backup/restore', [auth.verifyAdmin, multiparty({ maxFilesSize: 50 * 1024 * 1024 })], BackupController.restore); // 50MB limit

// 📝 NOTAS DE RESPALDO (Solo Admin)
router.get('/backup-notes', auth.verifyAdmin, SystemConfigController.getBackupNotes);
router.put('/backup-notes', auth.verifyAdmin, SystemConfigController.updateBackupNotes);

export default router;