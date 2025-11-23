import express from 'express';
import multiparty from 'connect-multiparty';
import auth from '../service/auth.js';
import * as projectController from '../controllers/ProjectController.js';

const path = multiparty({ uploadDir: './uploads/project' });
const filePath = multiparty({ uploadDir: './uploads/project-files' });
const router = express.Router();

// Rutas CRUD para proyectos
router.post("/register", [auth.verifyDashboard, path], projectController.register);
router.post("/update", [auth.verifyDashboard, path], projectController.update);
router.get("/list", [auth.verifyDashboard], projectController.list);
router.get("/check-sales/:id", [auth.verifyDashboard], projectController.checkSales);
// 🗑️ ELIMINADO: /list-settings - No usado en frontend
router.put("/toggle-featured/:id", [auth.verifyAdmin], projectController.toggle_featured);
router.delete("/remove/:id", [auth.verifyDashboard], projectController.remove);

// Rutas para manejar archivos ZIP
router.post("/upload-files/:id", [auth.verifyDashboard, filePath], projectController.uploadFiles);
router.delete("/remove-file/:projectId/:fileId", [auth.verifyDashboard], projectController.removeFile);
router.get("/download-file/:projectId/:filename", auth.verifyTienda, projectController.downloadFile);

// Ruta para obtener datos de un proyecto para el dashboard (incluye archivos)
router.get("/get-admin/:id", [auth.verifyDashboard], projectController.get_project_admin);
// Ruta para servir imágenes de proyectos
router.get("/show/:id", projectController.show_project); // Ruta pública
router.get("/imagen-project/:img", projectController.get_imagen);

export default router;
