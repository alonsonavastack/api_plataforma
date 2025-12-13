import routerx from 'express-promise-router'
import saleController from '../controllers/SaleController.js'
import auth from '../service/auth.js'

const router = routerx();

// Lista de ventas - Administradores e Instructores pueden ver sus ventas
router.get("/list", [auth.verifyTienda], saleController.list);

// 🔔 Notificaciones - Solo administradores
router.get("/recent-notifications", [auth.verifyAdmin], saleController.recent_notifications);
router.post("/mark-notifications-read", [auth.verifyAdmin], saleController.mark_notifications_read);

// 🔧 Procesar ventas existentes - Crear ganancias de instructores
router.post("/process-existing-sales", [auth.verifyAdmin], saleController.process_existing_sales);

// Actualizar estado - Solo administradores
router.put("/update-status/:id", [auth.verifyAdmin], saleController.update_status_sale);

// Registrar venta - Cualquier usuario autenticado
router.post("/register", auth.verifyTienda, saleController.register);
// PayPal support: create order and capture
router.post('/paypal/create', auth.verifyTienda, saleController.createPaypalOrder);
router.post('/paypal/capture', auth.verifyTienda, saleController.capturePaypalOrder);



// Obtener mis transacciones (estudiante)
router.get("/my-transactions", auth.verifyTienda, saleController.my_transactions);

// Buscar transacción por número
router.get("/transaction/:n_transaccion", auth.verifyTienda, saleController.get_by_transaction);



export default router;
