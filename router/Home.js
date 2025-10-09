import routerx from 'express-promise-router'
import homeController from '../controllers/HomeController.js'

const router = routerx();

router.get("/list",homeController.list);
router.get("/config-all",homeController.config_all);

router.get("/landing-curso/:slug",homeController.show_course);

router.post("/search-course",homeController.search_course);
router.get("/get_all_courses", homeController.get_all_courses);
router.get("/get_all_projects", homeController.get_all_projects);

export default router;