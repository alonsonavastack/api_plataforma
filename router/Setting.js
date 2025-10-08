import routerx from 'express-promise-router';
import SettingController from '../controllers/SettingController.js';
import auth from '../service/auth.js';

const router = routerx();

// Todas las rutas de ajustes requieren que el usuario sea administrador.
router.use(auth.verifyAdmin);

router.get('/list', SettingController.list);
router.put('/update', SettingController.update);

export default router;