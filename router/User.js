import routerx from 'express-promise-router'
import userController from '../controllers/UserController.js'
import auth from '../service/auth.js'

import multiparty from 'connect-multiparty';

const path = multiparty({uploadDir : './uploads/user'});

const router = routerx();
// ,auth.verifyAdmin
router.post("/register",userController.register)
router.post("/login_tienda",userController.login)
router.post("/login", userController.login_general); // RUTA UNIFICADA
//CRUD ADMIN 
router.post("/register_admin",[auth.verifyAdmin,path],userController.register_admin)
router.post("/update",[auth.verifyAdmin,path],userController.update)
router.get("/list",[auth.verifyAdmin],userController.list)
router.delete("/delete/:id",[auth.verifyAdmin],userController.remove)

router.get("/imagen-usuario/:img",userController.get_imagen);
export default router;