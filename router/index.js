import routerx from 'express-promise-router'
import User from './User.js'
import Categorie from './Categorie.js'
import Course from './Course.js'
import CourseSection from './CourseSection.js' // Mantener para la gestión de secciones
import CourseClase from './CourseClase.js'

import Discount from './Discount.js'
import Home from './Home.js'
import Cart from './Cart.js'
import Sale from './Sale.js'
import ProfileStudent from './ProfileStudent.js'
import Project from './Project.js' // Nuevo router para Project
import DashboardRouter from "./Dashboard.js";
import ProfileInstructorRouter from "./ProfileInstructor.js";
import ProfileAdminRouter from "./ProfileAdmin.js";
import SettingRouter from './Setting.js'; // Importamos el nuevo router
import ReportsRouter from './Reports.js'; // Nuevo router para reportes
import CarouselRouter from './Carousel.js'; // Importamos el router del carrusel

// SISTEMA DE PAGOS A INSTRUCTORES
import InstructorPaymentRouter from './InstructorPayment.js';
import AdminInstructorPaymentRouter from './AdminInstructorPayment.js';


// http://localhost:3000/api/users/register
const router = routerx();

router.use('/users',User);
router.use('/categories',Categorie);
router.use('/courses',Course);
router.use('/course-sections',CourseSection); // Renombrado para consistencia
router.use('/course_clase',CourseClase);
// router.use('/coupon',Coupon); // MÓDULO ELIMINADO - No se usaba (0% implementación frontend)
router.use('/discount',Discount);
router.use('/home',Home);
router.use('/cart',Cart);
router.use('/checkout',Sale);
router.use('/sales',Sale); // Agregado para notificaciones
router.use('/profile-student',ProfileStudent);
router.use('/project',Project); // Corregido: de plural a singular
router.use('/profile-instructor', ProfileInstructorRouter);
router.use('/profile-admin', ProfileAdminRouter);
router.use('/dashboard', DashboardRouter);
router.use('/settings', SettingRouter); // Usamos el nuevo router para settings
router.use('/reports', ReportsRouter); // Rutas de reportes
router.use('/carousel', CarouselRouter); // Usamos el router del carrusel

// SISTEMA DE PAGOS A INSTRUCTORES
router.use('/instructor', InstructorPaymentRouter); // Rutas para instructores
router.use('/admin', AdminInstructorPaymentRouter); // Rutas para administradores

export default router;
