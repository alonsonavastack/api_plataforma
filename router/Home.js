import routerx from 'express-promise-router'
import homeController from '../controllers/HomeController.js'

const router = routerx();

router.get("/list",homeController.list);
// 🗑️ ELIMINADO: /config-all - No usado en frontend

router.get("/landing-curso/:slug",homeController.show_course);
router.get('/general_search', homeController.general_search);

router.post("/search_course",homeController.search_course); // ✅ CORREGIDO: Cambiado de search-course a search_course
router.get("/get_all_courses", homeController.get_all_courses);
router.get("/get_all_projects", homeController.get_all_projects);

export default router;