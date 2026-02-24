import routerx from 'express-promise-router'
import saleController from '../controllers/SaleController.js'
import auth from '../service/auth.js'

const router = routerx();

// Diagnostic: validate handlers exist to avoid express-promise-router errors
console.log('[router/Sale] auth.verifyTienda type:', typeof auth.verifyTienda);
console.log('[router/Sale] saleController.createPaypalOrder type:', typeof saleController.createPaypalOrder);

// Lista de ventas - Administradores e Instructores pueden ver sus ventas
router.get("/list", [auth.verifyTienda], saleController.list);

// 🔔 Notificaciones - Solo administradores
router.get("/recent-notifications", [auth.verifyAdmin], saleController.recent_notifications);
router.post("/mark-notifications-read", [auth.verifyAdmin], saleController.mark_notifications_read);

// 🔧 Procesar ventas existentes - Crear ganancias de instructores
router.post("/process-existing-sales", [auth.verifyAdmin], saleController.process_existing_sales);

// 🔥 Corregir ganancias de ventas con cupón de referido que quedaron con 30% en vez de 20%
router.post("/fix-referral-earnings", [auth.verifyAdmin], saleController.fix_referral_earnings);

// Actualizar estado - Solo administradores
router.put("/update-status/:id", [auth.verifyAdmin], saleController.update_status_sale);

// Registrar venta - Cualquier usuario autenticado
router.post("/register", auth.verifyTienda, saleController.register);
// PayPal eliminado — usar Stripe



// Obtener mis transacciones (estudiante)
router.get("/my-transactions", auth.verifyTienda, saleController.my_transactions);

// Buscar transacción por número de transacción
router.get("/transaction/:n_transaccion", auth.verifyTienda, saleController.get_by_transaction);

// Buscar venta por ID de MongoDB (para verificar estado post-Stripe)
router.get("/by-id/:id", auth.verifyTienda, saleController.get_by_id);



export default router;
