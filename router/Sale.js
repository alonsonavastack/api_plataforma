import routerx from 'express-promise-router'
import saleController from '../controllers/SaleController.js'
import auth from '../service/auth.js'

const router = routerx();
router.get("/list", [auth.verifyAdmin], saleController.list);
router.put("/update-status/:id", [auth.verifyAdmin], saleController.update_status_sale);
router.post("/register",auth.verifyTienda,saleController.register);

export default router;