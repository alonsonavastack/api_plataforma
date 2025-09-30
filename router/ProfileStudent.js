import routerx from 'express-promise-router';
import * as ProfileStudentController from '../controllers/ProfileStudentController.js';
import auth from '../service/auth.js'; // Asegúrate de importar el middleware de autenticación
import multiparty from 'connect-multiparty';

const path = multiparty({ uploadDir: './uploads/user' });

const router = routerx();

// Rutas para el perfil del estudiante
router.get('/client', auth.verifyTienda, ProfileStudentController.client);
router.put('/update', auth.verifyTienda, ProfileStudentController.update); // Ya no necesita 'path'
router.put('/update-avatar', [ path, auth.verifyTienda], ProfileStudentController.update_avatar); // Nueva ruta para el avatar

export default router;