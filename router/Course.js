import routerx from 'express-promise-router'
import courseController from '../controllers/CourseController.js'
import auth from '../service/auth.js'

import multiparty from 'connect-multiparty';
const path = multiparty({uploadDir: './uploads/course'});
const path2 = multiparty(); // Para Vimeo, no guarda localmente

const router = routerx();

router.post("/register",[auth.verifyAdmin,path],courseController.register);
router.post("/update",[auth.verifyAdmin,path],courseController.update);

router.post("/upload_vimeo",[auth.verifyAdmin,path2],courseController.upload_vimeo);

router.get("/list",[auth.verifyAdmin],courseController.list);

router.get("/list-settings",[auth.verifyAdmin],courseController.list_settings);
router.put("/toggle-featured/:id",[auth.verifyAdmin],courseController.toggle_featured);

router.get("/show/:id",[auth.verifyAdmin],courseController.show_course);

router.get("/config_all",[auth.verifyAdmin],courseController.config_all);


router.delete("/remove/:id",[auth.verifyAdmin],courseController.remove);

router.get("/imagen-course/:img",courseController.get_imagen);

export default router;