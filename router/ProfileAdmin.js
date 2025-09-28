import routerx from "express-promise-router";
import profileAdminController from "../controllers/ProfileAdminController.js";
import auth from "../service/auth.js";

const router = routerx();

router.get("/profile", [auth.verifyAdmin], profileAdminController.profile);

export default router;