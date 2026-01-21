import routerx from 'express-promise-router';
import * as couponController from '../controllers/CouponController.js';
import auth from '../service/auth.js';

const router = routerx();

// Rutas para cupones (Instructor)
router.post('/create', auth.verifyDashboard, couponController.create);
router.get('/list', auth.verifyDashboard, couponController.list);

// Ruta pública para validar en checkout
router.post('/validate', couponController.validate);

export default router;
