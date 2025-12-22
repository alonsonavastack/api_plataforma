import express from 'express';
import * as RefundController from '../controllers/RefundController.js';
import auth from '../service/auth.js';

const api = express.Router();

// Listar reembolsos (todos los roles autenticados)
api.get('/list', auth.verifyDashboard, RefundController.list);

// Calcular preview del reembolso (antes de solicitar)
api.get('/calculate-preview', auth.verifyDashboard, RefundController.calculatePreview);

// ✅ NUEVO: Verificar elegibilidad de reembolso
api.get('/check-eligibility', auth.verifyTienda, RefundController.checkRefundEligibility);

// 🔧 DEBUG: Obtener reembolsos por usuario/producto (solo autenticados)
api.get('/debug/list-by-product', auth.verifyDashboard, RefundController.debugListByProduct);

// Crear solicitud de reembolso (Customer)
api.post('/create', auth.verifyDashboard, RefundController.create);

// Solicitar un reembolso (Estudiante)
api.post('/request-refund', auth.verifyTienda, RefundController.requestRefund);

// Revisar reembolso - aprobar/rechazar (Admin/Instructor)
api.put('/review/:id', auth.verifyInstructor, RefundController.review);

// Marcar como completado (Admin)
api.put('/complete/:id', auth.verifyAdmin, RefundController.markCompleted);

// Estadísticas de reembolsos (Admin)
api.get('/statistics', auth.verifyAdmin, RefundController.statistics);

export default api;
