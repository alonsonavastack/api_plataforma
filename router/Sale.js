import routerx from 'express-promise-router'
import saleController from '../controllers/SaleController.js'
import auth from '../service/auth.js'

const router = routerx();

router.post("/register",auth.verifyTienda,saleController.register);
// La ruta para enviar email estaba comentada y no se usa directamente como endpoint público.

export default router;