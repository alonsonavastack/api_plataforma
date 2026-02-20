import routerx from 'express-promise-router';
import auth from '../service/auth.js';
import PaymentSettingsController from '../controllers/PaymentSettingsController.js';

const router = routerx();

// Rutas protegidas para admin
router.get('/admin', [auth.verifyAdmin], PaymentSettingsController.getSettings);
router.put('/admin', [auth.verifyAdmin], PaymentSettingsController.updateSettings);

// Ruta pública para checkout
router.get('/public', PaymentSettingsController.getPublicSettings);

// 🔧 DEBUG TEMPORAL - Ver raw de MongoDB
router.get('/debug-raw', [auth.verifyAdmin], async (req, res) => {
    const PaymentSettings = (await import('../models/PaymentSettings.js')).default;
    const doc = await PaymentSettings.findOne().lean();
    res.json({ doc });
});

export default router;
