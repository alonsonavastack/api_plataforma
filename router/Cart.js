import routerx from 'express-promise-router'
import cartController from '../controllers/CartController.js'
import auth from '../service/auth.js'

const router = routerx();

router.post("/add",[auth.verifyTienda],cartController.register);
router.post("/register",[auth.verifyTienda],cartController.register);
router.post("/update",[auth.verifyTienda],cartController.update);
router.get("/list",[auth.verifyTienda],cartController.list);
router.delete("/remove/:id",[auth.verifyTienda],cartController.remove);

export default router;