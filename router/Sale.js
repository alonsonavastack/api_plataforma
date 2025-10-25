import routerx from 'express-promise-router'
import saleController from '../controllers/SaleController.js'
import auth from '../service/auth.js'

const router = routerx();

// Lista de ventas - Administradores e Instructores pueden ver sus ventas
router.get("/list", [auth.verifyTienda], saleController.list);

// 🔔 Notificaciones - Solo administradores
router.get("/recent-notifications", [auth.verifyAdmin], saleController.recent_notifications);
router.post("/mark-notifications-read", [auth.verifyAdmin], saleController.mark_notifications_read);

// Actualizar estado - Solo administradores
router.put("/update-status/:id", [auth.verifyAdmin], saleController.update_status_sale);

// Registrar venta - Cualquier usuario autenticado
router.post("/register", auth.verifyTienda, saleController.register);

// Obtener mis transacciones (estudiante)
router.get("/my-transactions", auth.verifyTienda, saleController.my_transactions);

// Buscar transacción por número
router.get("/transaction/:n_transaccion", auth.verifyTienda, saleController.get_by_transaction);

export default router;
