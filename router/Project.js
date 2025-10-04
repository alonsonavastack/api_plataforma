import routerx from 'express-promise-router';
import projectController from '../controllers/ProjectController.js';
import auth from '../service/auth.js';

// Renombramos la variable 'path' a 'multipartyMiddleware' para evitar conflictos.
import multiparty from 'connect-multiparty';
const multipartyMiddleware = multiparty({uploadDir: './uploads/project'}); // Directorio para imágenes de proyectos
const multipartyFilesMiddleware = multiparty({uploadDir: './uploads/project-files', maxFilesSize: 50 * 1024 * 1024}); // 50MB máximo

const router = routerx();

// Rutas CRUD para proyectos
router.post("/register",[auth.verifyDashboard, multipartyMiddleware],projectController.register);
router.post("/update",[auth.verifyDashboard, multipartyMiddleware],projectController.update);
router.get("/list",[auth.verifyDashboard],projectController.list);
router.delete("/remove/:id",[auth.verifyDashboard],projectController.remove);

// Rutas para manejar archivos ZIP
router.post("/upload-files/:id",[auth.verifyDashboard, multipartyFilesMiddleware],projectController.uploadFiles);
router.delete("/remove-file/:projectId/:fileId",[auth.verifyDashboard],projectController.removeFile);
router.get("/download-file/:projectId/:filename",projectController.downloadFile);

// Ruta para obtener datos de un proyecto para el dashboard (incluye archivos)
router.get("/get-admin/:id", [auth.verifyDashboard], projectController.get_project_admin);
// Ruta para servir imágenes de proyectos
router.get("/show/:id",projectController.show_project); // Ruta pública
router.get("/imagen-project/:img",projectController.get_imagen);

export default router;
