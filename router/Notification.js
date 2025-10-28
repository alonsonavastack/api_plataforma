import { Router } from "express";
import NotificationController from "../controllers/NotificationController.js";
import auth from '../service/auth.js';

// 🔧 FIX BUG #67: Rutas de Notificaciones
const router = Router();

// Todas las rutas requieren autenticación
router.get('/list', auth.verifyDashboard, NotificationController.list);
router.put('/mark-as-read/:id', auth.verifyDashboard, NotificationController.markAsRead);
router.put('/mark-all-as-read', auth.verifyDashboard, NotificationController.markAllAsRead);
router.delete('/remove/:id', auth.verifyDashboard, NotificationController.remove);
router.get('/unread-count', auth.verifyDashboard, NotificationController.getUnreadCount);

export default router;
