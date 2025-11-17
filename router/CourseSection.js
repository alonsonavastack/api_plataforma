import routerx from 'express-promise-router'
import courseSectionController from '../controllers/CourseSectionController.js'
import auth from '../service/auth.js';

const router = routerx();

router.post("/register",auth.verifyInstructor,courseSectionController.register);
router.put("/update",auth.verifyInstructor,courseSectionController.update);
router.get("/list",auth.verifyInstructor,courseSectionController.list);
router.delete("/remove/:id",auth.verifyInstructor,courseSectionController.remove);

export default router;
