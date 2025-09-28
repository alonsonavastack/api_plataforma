import routerx from 'express-promise-router';
import projectController from '../controllers/ProjectController.js'; // Asumiendo que crearás este controlador
import auth from '../service/auth.js';

import multiparty from 'connect-multiparty';
const path = multiparty({uploadDir: './uploads/project'}); // Directorio para imágenes de proyectos
const path2 = multiparty(); // Para archivos de proyecto (si se suben directamente, no a Vimeo)

const router = routerx();

// Rutas CRUD para proyectos
router.post("/register",[auth.verifyAdmin,path],projectController.register);
router.post("/update",[auth.verifyAdmin,path],projectController.update);
router.get("/list",[auth.verifyAdmin],projectController.list);
router.get("/show/:id",[auth.verifyAdmin],projectController.show_project);
router.delete("/remove/:id",[auth.verifyAdmin],projectController.remove);

// Ruta para servir imágenes de proyectos
router.get("/imagen-project/:img",projectController.get_imagen);

export default router;