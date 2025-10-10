import routerx from 'express-promise-router'
import saleController from '../controllers/SaleController.js'
import auth from '../service/auth.js'

const router = routerx();

// Lista de ventas - Administradores e Instructores pueden ver sus ventas
router.get("/list", [auth.verifyTienda], saleController.list);

// Actualizar estado - Solo administradores
router.put("/update-status/:id", [auth.verifyAdmin], saleController.update_status_sale);

// Registrar venta - Cualquier usuario autenticado
router.post("/register", auth.verifyTienda, saleController.register);

export default router;
