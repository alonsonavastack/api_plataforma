import routerx from "express-promise-router";
import profileInstructorController from "../controllers/ProfileInstructorController.js";
import auth from "../service/auth.js";
import multiparty from 'connect-multiparty';

const path = multiparty({uploadDir : './uploads/user'});

const router = routerx();

router.get("/profile", [auth.verifyDashboard], profileInstructorController.profile);
router.post("/update", [auth.verifyDashboard], profileInstructorController.update);
router.post("/update-avatar", [path, auth.verifyDashboard], profileInstructorController.update_avatar);

export default router;