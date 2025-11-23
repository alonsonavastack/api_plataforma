import routerx from "express-promise-router";
import profileInstructorController from "../controllers/ProfileInstructorController.js";
import auth from "../service/auth.js";
import multiparty from 'connect-multiparty';

const path = multiparty({uploadDir : './uploads/user'});

const router = routerx();

// 🗑️ ELIMINADO: /profile - Frontend usa /users/profile en su lugar
router.put("/update", [auth.verifyDashboard], profileInstructorController.update);
router.post("/update-avatar", [path, auth.verifyDashboard], profileInstructorController.update_avatar);
router.post("/update-password", [auth.verifyDashboard], profileInstructorController.update_password);

export default router;