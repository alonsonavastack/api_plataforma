import routerx from 'express-promise-router'
import discountController from '../controllers/DiscountController.js'
import auth from '../service/auth.js'

const router = routerx();

router.post("/register",[auth.verifyAdmin],discountController.register);
router.post("/update",[auth.verifyAdmin],discountController.update);
router.get("/list",discountController.list);
router.get("/show/:id",[auth.verifyAdmin],discountController.show_discount);
router.get("/config_all",[auth.verifyAdmin],discountController.config_all);
router.delete("/remove/:id",[auth.verifyAdmin],discountController.remove);

export default router;