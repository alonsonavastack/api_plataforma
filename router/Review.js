import express from "express";
import ReviewController from "../controllers/ReviewController.js";
import auth from "../service/auth.js";

const router = express.Router();

// Crear una nueva calificación/review
router.post("/create", auth.verifyTienda, ReviewController.create);

// Obtener todas las calificaciones de un producto específico
router.get("/product/:product_id/:product_type", ReviewController.getByProduct);

// Actualizar una calificación existente
router.put("/update/:review_id", auth.verifyTienda, ReviewController.update);

// Eliminar una calificación
router.delete("/delete/:review_id", auth.verifyTienda, ReviewController.delete);

// Verificar si el usuario puede calificar un producto (público)
router.get("/can-rate/:product_id/:product_type", ReviewController.canRate);

// ✅ NUEVO: Agregar respuesta del instructor a una review
router.post("/reply/:review_id", auth.verifyInstructor, ReviewController.addReply);

// ✅ NUEVO: Actualizar respuesta del instructor
router.put("/reply/:review_id", auth.verifyInstructor, ReviewController.updateReply);

// ✅ NUEVO: Eliminar respuesta del instructor
router.delete("/reply/:review_id", auth.verifyInstructor, ReviewController.deleteReply);

// 🔔 NUEVO: Obtener reviews sin respuesta de los cursos del instructor (notificaciones)
router.get("/instructor/pending-replies", auth.verifyInstructor, ReviewController.getPendingRepliesForInstructor);

// 🧹 NUEVO: Marcar todas las notificaciones de reviews como leídas
router.post("/instructor/mark-all-read", auth.verifyInstructor, ReviewController.markAllRepliesAsRead);

export default router;
