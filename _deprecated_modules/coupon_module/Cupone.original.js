import routerx from 'express-promise-router'
import couponController from '../controllers/CuponeController.js'
import auth from '../service/auth.js'

const router = routerx();

router.post("/register",[auth.verifyAdmin],couponController.register);
router.post("/update",[auth.verifyAdmin],couponController.update);
router.get("/list",[auth.verifyAdmin],couponController.list);
router.get("/show/:id",[auth.verifyAdmin],couponController.show_cupone);
router.get("/config_all",[auth.verifyAdmin],couponController.config_all);
router.delete("/remove/:id",[auth.verifyAdmin],couponController.remove);

export default router;