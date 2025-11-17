import routerx from "express-promise-router";
import dashboardController from "../controllers/DashboardController.js";
import auth from "../service/auth.js";

const router = routerx();

router.get("/kpis", [auth.verifyDashboard], dashboardController.kpis);
router.get("/executive-metrics", [auth.verifyAdmin], dashboardController.executiveMetrics); // ✅ NUEVO
router.get("/students", [auth.verifyDashboard], dashboardController.listStudents);
router.get("/distribution", [auth.verifyDashboard], dashboardController.distribution);
router.get('/monthlyIncome', auth.verifyDashboard, dashboardController.monthlyIncome);
router.get('/recentActivity', auth.verifyDashboard, dashboardController.recentActivity); // 🆕 NUEVO

export default router;
