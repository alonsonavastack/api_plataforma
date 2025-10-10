import routerx from 'express-promise-router'
import DiscountController from '../controllers/DiscountController.js';
import auth from '../middlewares/auth.js';

const router = routerx();

// Todas las rutas de descuentos requieren que el usuario sea administrador.
// El middleware 'auth.verifyDashboard' y 'auth.isAdmin' se encargarán de la seguridad.

router.get('/config', [auth.verifyDashboard, auth.isAdmin], DiscountController.getConfig);
router.post('/register', [auth.verifyDashboard, auth.isAdmin], DiscountController.register);
router.put('/update', [auth.verifyDashboard, auth.isAdmin], DiscountController.update);
router.delete('/remove/:id', [auth.verifyDashboard, auth.isAdmin], DiscountController.remove);

export default router;