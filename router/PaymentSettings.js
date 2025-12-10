import routerx from 'express-promise-router';
import auth from '../service/auth.js';
import PaymentSettingsController from '../controllers/PaymentSettingsController.js';

const router = routerx();

// Rutas protegidas para admin
router.get('/admin', [auth.verifyAdmin], PaymentSettingsController.getSettings);
router.put('/admin', [auth.verifyAdmin], PaymentSettingsController.updateSettings);

// Ruta pública para checkout
router.get('/public', PaymentSettingsController.getPublicSettings);

export default router;
