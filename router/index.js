import routerx from 'express-promise-router'
import User from './User.js'
import Categorie from './Categorie.js'
import Course from './Course.js'
import CourseSection from './CourseSection.js' // Mantener para la gestión de secciones
import CourseClase from './CourseClase.js'

import Discount from './Discount.js'
import Home from './Home.js'
import Sale from './Sale.js'
import ProfileStudent from './ProfileStudent.js'
import Project from './Project.js' // Nuevo router para Project
import DashboardRouter from "./Dashboard.js";
import ProfileInstructorRouter from "./ProfileInstructor.js";
import ProfileAdminRouter from "./ProfileAdmin.js";
import SettingRouter from './Setting.js'; // Importamos el nuevo router
import ReportsRouter from './Reports.js'; // Nuevo router para reportes
import CarouselRouter from './Carousel.js'; // Importamos el router del carrusel
import ReviewRouter from './Review.js'; // Importamos el router de reviews/calificaciones
// import ShortUrlRouter from './short-url.js'; // 🗑️ DESHABILITADO - No usado en frontend (decidir si eliminar)
import RefundRouter from './Refund.js'; // 💸 Router de reembolsos
import SystemConfigRouter from './SystemConfig.js'; // 🆕 Router de configuración del sistema
import WalletRouter from './Wallet.js'; // 💰 Router de billetera digital
import SeoRouter from './Seo.js'; // 🔍 Router de SEO Bot Proxy

import PaymentDashboardRouter from './PaymentDashboard.js'; // 📊 Dashboard de pagos
import TestingRouter from './Testing.js'; // 🧪 Router de testing (solo desarrollo)

// SISTEMA DE PAGOS A INSTRUCTORES
import InstructorPaymentRouter from './InstructorPayment.js';
import AdminInstructorPaymentRouter from './AdminInstructorPayment.js';
import PaymentSettingsRouter from './PaymentSettings.js'; // 💳 Configuración de pagos
import TaxBreakdownRouter from './taxBreakdown.js'; // 🧮 Sistema de desglose fiscal
import TelegramRouter from './telegram.js'; // 📱 Webhook Telegram
import HealthRouter from './health.js'; // 🏥 Health check endpoints
import StripeRouter from './Stripe.js'; // 💳 Stripe Connect
import OgShareRouter from './OgShare.js'; // 🔗 Open Graph para redes sociales

// http://localhost:3000/api/users/register
const router = routerx();

router.use('/users', User);
router.use('/categories', Categorie);
router.use('/courses', Course);
router.use('/course-sections', CourseSection); // Renombrado para consistencia
router.use('/course_clase', CourseClase);
import Coupon from './Coupon.js'; // 🔥 IMPORT NUEVO
// ...
router.use('/coupons', Coupon); // Habilitado y corregido a plural para consistencia
router.use('/discount', Discount);
router.use('/home', Home);
router.use('/checkout', Sale);
router.use('/sales', Sale); // Agregado para notificaciones
router.use('/profile-student', ProfileStudent);
router.use('/projects', Project); // Cambiado a plural para consistencia
router.use('/profile-instructor', ProfileInstructorRouter);
router.use('/profile-admin', ProfileAdminRouter);
router.use('/dashboard', DashboardRouter);
router.use('/settings', SettingRouter); // Usamos el nuevo router para settings
router.use('/reports', ReportsRouter); // Rutas de reportes
router.use('/carousel', CarouselRouter); // Usamos el router del carrusel
router.use('/reviews', ReviewRouter); // Rutas de reviews/calificaciones
// router.use('/short-url', ShortUrlRouter); // 🗑️ DESHABILITADO - No usado en frontend
router.use('/refunds', RefundRouter); // 💸 Rutas de reembolsos
router.use('/system-config', SystemConfigRouter); // 🆕 Rutas de configuración del sistema
router.use('/wallet', WalletRouter); // 💰 Rutas de billetera digital
router.use('/seo', SeoRouter); // 🔍 Rutas SEO Bot Proxy proxy
// router.use('/transfers', TransferRouter); // 🗑️ ELIMINADO
router.use('/payment-dashboard', PaymentDashboardRouter); // 📊 Dashboard de pagos
router.use('/share', OgShareRouter); // 🔗 Open Graph share para redes sociales

// SISTEMA DE PAGOS A INSTRUCTORES
router.use('/instructor', InstructorPaymentRouter); // Rutas para instructores
router.use('/admin', AdminInstructorPaymentRouter); // Rutas para administradores
router.use('/payment-settings', PaymentSettingsRouter); // 💳 Rutas de configuración de pagos
router.use('/admin/tax-breakdown', TaxBreakdownRouter); // 🧮 Rutas de desglose fiscal
router.use('/telegram', TelegramRouter); // 📱 Webhook y utilidades Telegram
router.use('/stripe', StripeRouter); // 💳 Stripe Connect - pagos automáticos a instructores

// 🏥 HEALTH CHECK - Siempre disponible
router.use('/', HealthRouter); // Endpoints: /health, /ready, /live

// 🧪 TESTING - SOLO DESARROLLO
if (process.env.NODE_ENV !== 'production') {
    router.use('/testing', TestingRouter); // 🧪 Rutas de testing multi-país
    console.log('🧪 [ROUTER] Rutas de testing habilitadas (solo desarrollo)');
}

export default router;
