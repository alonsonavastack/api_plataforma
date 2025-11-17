import { Router } from "express";
import ShortUrlController from "../controllers/ShortUrlController.js";
import auth from "../service/auth.js";

const router = Router();

// Crear o obtener short URL (requiere autenticación)
router.post('/create', auth.verifyDashboard, ShortUrlController.createOrGet);

// Obtener estadísticas de un short URL
router.get('/stats/:shortCode', ShortUrlController.stats);

// Listar short URLs del usuario
router.get('/my-urls', auth.verifyDashboard, ShortUrlController.list);

// Redirigir desde short URL (ruta pública sin /api prefix)
// Esta ruta debe ser manejada en el router principal
router.get('/:shortCode', ShortUrlController.redirect);

export default router;
