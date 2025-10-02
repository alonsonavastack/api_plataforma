import routerx from 'express-promise-router';
import projectController from '../controllers/ProjectController.js'; // Asumiendo que crearás este controlador
import auth from '../service/auth.js';

// Renombramos la variable 'path' a 'multipartyMiddleware' para evitar conflictos.
import multiparty from 'connect-multiparty';
const multipartyMiddleware = multiparty({uploadDir: './uploads/project'}); // Directorio para imágenes de proyectos
const path2 = multiparty(); // Para archivos de proyecto (si se suben directamente, no a Vimeo)

const router = routerx();

// Rutas CRUD para proyectos
router.post("/register",[auth.verifyDashboard, multipartyMiddleware],projectController.register);
router.post("/update",[auth.verifyDashboard, multipartyMiddleware],projectController.update);
router.get("/list",[auth.verifyDashboard],projectController.list);
router.delete("/remove/:id",[auth.verifyDashboard],projectController.remove);

// Ruta para servir imágenes de proyectos
router.get("/show/:id",projectController.show_project); // Ruta pública
router.get("/imagen-project/:img",projectController.get_imagen);

export default router;