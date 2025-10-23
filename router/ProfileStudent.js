import routerx from 'express-promise-router';
import * as ProfileStudentController from '../controllers/ProfileStudentController.js';
import auth from '../service/auth.js'; // Asegúrate de importar el middleware de autenticación
import multiparty from 'connect-multiparty';

const path = multiparty({ uploadDir: './uploads/user' });

const router = routerx();

// Rutas para el perfil del estudiante
router.get('/client', auth.verifyTienda, ProfileStudentController.client);
router.get('/transactions', auth.verifyTienda, ProfileStudentController.getTransactions); // Nueva ruta para obtener transacciones
router.put('/update', auth.verifyTienda, ProfileStudentController.update); // Ya no necesita 'path'
router.post('/update-password', auth.verifyTienda, ProfileStudentController.updatePassword); // Nueva ruta para cambiar contraseña
router.put('/update-avatar', [ path, auth.verifyTienda], ProfileStudentController.update_avatar); // Nueva ruta para el avatar

export default router;