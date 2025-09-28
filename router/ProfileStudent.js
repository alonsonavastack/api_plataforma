import routerx from "express-promise-router";
import profileStudentController from "../controllers/ProfileStudentController.js";
import auth from "../service/auth.js";
import multiparty from 'connect-multiparty';

const path = multiparty({uploadDir : './uploads/user'});

const router = routerx();

router.get("/client", auth.verifyTienda, profileStudentController.profile_student);
router.get("/course/:slug",auth.verifyTienda,profileStudentController.course_leason);
router.post("/update", [path, auth.verifyTienda], profileStudentController.update_student);
router.post("/course-student",[auth.verifyTienda],profileStudentController.course_student);
router.post("/review-register", [auth.verifyTienda], profileStudentController.review_register);
router.post("/review-update",[auth.verifyTienda],profileStudentController.review_update);

export default router;