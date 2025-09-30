import routerx from 'express-promise-router';
import * as CourseClaseController from '../controllers/CourseClaseController.js';
import auth from '../service/auth.js';

const router = routerx();

// Usamos verifyDashboard porque es para instructores y admins
router.post('/register', auth.verifyDashboard, CourseClaseController.register);
router.get('/list', auth.verifyDashboard, CourseClaseController.list);
router.put('/update', auth.verifyDashboard, CourseClaseController.update);
router.delete('/remove/:id', auth.verifyDashboard, CourseClaseController.remove);
router.put('/reorder', auth.verifyDashboard, CourseClaseController.reorder);
router.get('/vimeo-data', auth.verifyDashboard, CourseClaseController.get_vimeo_data);

export default router;