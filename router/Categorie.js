import routerx from 'express-promise-router';
import categorieController from '../controllers/CategorieController.js';
import auth from '../service/auth.js';
import multiparty from 'connect-multiparty';

const path = multiparty({ uploadDir: './uploads/categorie' });

const router = routerx();

router.get("/list", [auth.verifyDashboard], categorieController.list); // Permite a admin e instructor
router.post("/register", [auth.verifyAdmin, path], categorieController.register); // Solo admin
router.put("/update", [auth.verifyAdmin, path], categorieController.update); // Solo admin
router.delete("/remove/:id", [auth.verifyAdmin], categorieController.remove); // Solo admin
router.get("/imagen-categorie/:img", categorieController.get_imagen);

export default router;