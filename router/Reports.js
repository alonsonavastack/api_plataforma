import express from "express";
import ReportsController from "../controllers/reports/index.js";
import CommissionReportController from "../controllers/CommissionReportController.js";
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

// 📋 NUEVO: GET /api/reports/sales/list?start_date=2024-01-01&end_date=2024-12-31&product_type=course
router.get('/sales/list', auth.verifyDashboard, ReportsController.Sales.salesList);

// 📊 NUEVO: GET /api/reports/sales/report?start_date=2024-01-01&end_date=2024-12-31&product_type=course
router.get('/sales/report', auth.verifyDashboard, ReportsController.Sales.salesReport);

// ✅ NUEVO: GET /api/reports/sales/refund-statistics (Solo Admin)
router.get('/sales/refund-statistics', auth.verifyAdmin, ReportsController.Sales.refundStatistics);

// 📊 ALIAS: GET /api/reports/refunds (Solo Admin) - Alias más corto
router.get('/refunds', auth.verifyAdmin, ReportsController.Sales.refundStatistics);

// ==================== REPORTES DE ESTUDIANTES ====================
// GET /api/reports/students/growth?period=month
router.get('/students/growth', auth.verifyDashboard, ReportsController.Students.studentGrowth);

// GET /api/reports/students/active
router.get('/students/active', auth.verifyDashboard, ReportsController.Students.activeStudents);

// GET /api/reports/students/by-course
router.get('/students/by-course', auth.verifyDashboard, ReportsController.Students.studentsByCourse);

// GET /api/reports/students/top?limit=10
router.get('/students/top', auth.verifyDashboard, ReportsController.Students.topStudents);

// 📊 NUEVO: GET /api/reports/students/report?start_date=2024-01-01&end_date=2024-12-31
router.get('/students/report', auth.verifyDashboard, ReportsController.Students.studentsReport);

// ==================== REPORTES DE PRODUCTOS ====================
// GET /api/reports/products/analysis?product_type=course
router.get('/products/analysis', auth.verifyDashboard, ReportsController.Products.productsAnalysis);

// GET /api/reports/products/low-performing?min_sales=5&min_rating=3
router.get('/products/low-performing', auth.verifyDashboard, ReportsController.Products.lowPerformingProducts);

// GET /api/reports/products/reviews?product_id=xxxxx
router.get('/products/reviews', auth.verifyDashboard, ReportsController.Products.reviewsAnalysis);

// 📊 NUEVO: GET /api/reports/products/report?product_type=course&sort_by=revenue
router.get('/products/report', auth.verifyDashboard, ReportsController.Products.productsReport);

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

// ==================== REPORTES DE COMISIONES (SOLO ADMIN) ====================
// GET /api/reports/commissions/summary?period=month&start_date=2024-01-01&end_date=2024-12-31
router.get('/commissions/summary', auth.verifyAdmin, CommissionReportController.getCommissionsSummary);

// GET /api/reports/commissions/by-period?period=month&start_date=2024-01-01&end_date=2024-12-31
router.get('/commissions/by-period', auth.verifyAdmin, CommissionReportController.getCommissionsByPeriod);

// GET /api/reports/commissions/by-instructor?start_date=2024-01-01&end_date=2024-12-31
router.get('/commissions/by-instructor', auth.verifyAdmin, CommissionReportController.getCommissionsByInstructor);

// GET /api/reports/commissions/by-product?start_date=2024-01-01&end_date=2024-12-31&product_type=course
router.get('/commissions/by-product', auth.verifyAdmin, CommissionReportController.getCommissionsByProduct);

export default router;
