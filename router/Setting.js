// /api/router/Setting.js
import routerx from 'express-promise-router';
import SettingController from '../controllers/SettingController.js';
import auth from '../service/auth.js';

const router = routerx();

// Todas las rutas de ajustes requieren que el usuario sea administrador
router.use(auth.verifyAdmin);

// Listar todos los settings
router.get('/list', SettingController.list);

// Obtener settings por grupo (general, commissions, payments, etc.)
router.get('/group/:group', SettingController.getByGroup);

// Obtener un setting específico por key
router.get('/key/:key', SettingController.getByKey);

// Actualizar múltiples settings
router.put('/update', SettingController.update);

// Actualizar un solo setting
router.put('/update/:key', SettingController.updateOne);

// Inicializar settings por defecto (útil después del seed)
router.post('/initialize-defaults', SettingController.initializeDefaults);

export default router;
