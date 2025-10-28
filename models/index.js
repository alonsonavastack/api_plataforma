import User from './User.js'
import Categorie from './Categorie.js'
import Course from './Course.js'
import CourseSection from './CourseSection.js'
import CourseClase from './CourseClase.js'
import CourseClaseFile from './CourseClaseFile.js';
// import Coupon from './Cupone.js'; // ELIMINADO - Módulo no usado
import Discount from './Discount.js'
import Cart from './Cart.js'
import Project from './Project.js';
import Setting from './Setting.js';

import Sale from './Sale.js'
import SaleDetail from './SaleDetail.js'
import CourseStudent from './CourseStudent.js'
import Review from './Review.js'

// MODELOS DEL SISTEMA DE PAGOS A INSTRUCTORES
import InstructorPaymentConfig from './InstructorPaymentConfig.js'
import InstructorEarnings from './InstructorEarnings.js'
import InstructorPayment from './InstructorPayment.js'
import PlatformCommissionSettings from './PlatformCommissionSettings.js'
import CarouselImage from './CarouselImage.js'
import Notification from './Notification.js' // 🔧 FIX BUG #67

export default {
    User,
    Categorie,
    Course,
    CourseSection,
    CourseClase,
    CourseClaseFile,
    // Coupon, // ELIMINADO - Módulo no usado
    Discount,
    Cart,
    Project,
    Setting,

    Sale,
    SaleDetail,
    CourseStudent,
    Review,
    
    // Sistema de pagos a instructores
    InstructorPaymentConfig,
    InstructorEarnings,
    InstructorPayment,
    PlatformCommissionSettings,
    CarouselImage,
    Notification, // 🔧 FIX BUG #67
}
