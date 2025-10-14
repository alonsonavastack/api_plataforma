import express from "express";
import ReportsController from "../controllers/reports/index.js";
import auth from "../service/auth.js";

const router = express.Router();

// ==================== REPORTES DE VENTAS ====================
// GET /api/reports/sales/income-by-period?period=month
router.get('/sales/income-by-period', auth.verifyDashboard, ReportsController.Sales.incomeByPeriod);

// GET /api/reports/sales/top-products?limit=10
router.get('/sales/top-products', auth.verifyDashboard, ReportsController.Sales.topProducts);

// GET /api/reports/sales/by-category
router.get('/sales/by-category', auth.verifyDashboard, ReportsController.Sales.salesByCategory);

// GET /api/reports/sales/payment-methods (Solo Admin)
router.get('/sales/payment-methods', auth.verifyAdmin, ReportsController.Sales.paymentMethods);

// GET /api/reports/sales/period-comparison?period=month
router.get('/sales/period-comparison', auth.verifyDashboard, ReportsController.Sales.periodComparison);

// ==================== REPORTES DE ESTUDIANTES ====================
// GET /api/reports/students/growth?period=month
router.get('/students/growth', auth.verifyDashboard, ReportsController.Students.studentGrowth);

// GET /api/reports/students/active
router.get('/students/active', auth.verifyDashboard, ReportsController.Students.activeStudents);

// GET /api/reports/students/by-course
router.get('/students/by-course', auth.verifyDashboard, ReportsController.Students.studentsByCourse);

// GET /api/reports/students/top?limit=10
router.get('/students/top', auth.verifyDashboard, ReportsController.Students.topStudents);

// ==================== REPORTES DE PRODUCTOS ====================
// GET /api/reports/products/analysis?product_type=course
router.get('/products/analysis', auth.verifyDashboard, ReportsController.Products.productsAnalysis);

// GET /api/reports/products/low-performing?min_sales=5&min_rating=3
router.get('/products/low-performing', auth.verifyDashboard, ReportsController.Products.lowPerformingProducts);

// GET /api/reports/products/reviews?product_id=xxxxx
router.get('/products/reviews', auth.verifyDashboard, ReportsController.Products.reviewsAnalysis);

// ==================== REPORTES DE DESCUENTOS ====================
// GET /api/reports/discounts/coupon-effectiveness (Solo Admin)
router.get('/discounts/coupon-effectiveness', auth.verifyAdmin, ReportsController.Discounts.couponEffectiveness);

// GET /api/reports/discounts/impact?start_date=2024-01-01&end_date=2024-12-31 (Solo Admin)
router.get('/discounts/impact', auth.verifyAdmin, ReportsController.Discounts.discountsImpact);

// GET /api/reports/discounts/campaign-performance (Solo Admin)
router.get('/discounts/campaign-performance', auth.verifyAdmin, ReportsController.Discounts.campaignPerformance);

// ==================== REPORTES DE INSTRUCTORES ====================
// GET /api/reports/instructors/ranking (Solo Admin)
router.get('/instructors/ranking', auth.verifyAdmin, ReportsController.Instructors.instructorRanking);

// GET /api/reports/instructors/detail?instructor_id=xxxxx
router.get('/instructors/detail', auth.verifyDashboard, ReportsController.Instructors.instructorDetail);

// GET /api/reports/instructors/revenue-distribution (Solo Admin)
router.get('/instructors/revenue-distribution', auth.verifyAdmin, ReportsController.Instructors.revenueDistribution);

export default router;
