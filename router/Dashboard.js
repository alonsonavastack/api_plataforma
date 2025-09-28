import routerx from "express-promise-router";
import dashboardController from "../controllers/DashboardController.js";
import auth from "../service/auth.js";

const router = routerx();

router.get("/kpis", [auth.verifyDashboard], dashboardController.kpis);

export default router;