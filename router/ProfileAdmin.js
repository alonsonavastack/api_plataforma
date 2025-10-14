import routerx from "express-promise-router";
import UserController from "../controllers/UserController.js";
import auth from "../service/auth.js";
import multiparty from "connect-multiparty";

const router = routerx();
const multipartyMiddleware = multiparty({ uploadDir: './uploads/user' });

// Obtener el perfil del administrador
router.get("/profile", [auth.verifyAdmin], UserController.profile);

// Actualizar datos del perfil (nombre, email, etc.)
router.put("/update", [auth.verifyAdmin], UserController.update);

// Actualizar la contraseña
router.put("/update-password", [auth.verifyAdmin], UserController.update_password);

// Actualizar el avatar (requiere multiparty para el archivo)
router.post("/update-avatar", [auth.verifyAdmin, multipartyMiddleware], UserController.update_avatar);

export default router;