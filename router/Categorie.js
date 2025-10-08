import express from 'express';
import auth from '../service/auth.js';
import multiparty from 'connect-multiparty';
import { register, update, list, remove, get_imagen } from '../controllers/CategorieController.js';

const path = multiparty({ uploadDir: './uploads/categorie' });

const router = express.Router();

router.get("/list", [auth.verifyDashboard], list); // Permite a admin e instructor
router.post("/register", [auth.verifyAdmin, path], register); // Solo admin
router.put("/update", [auth.verifyAdmin, path], update); // Solo admin
router.delete("/remove/:id", [auth.verifyAdmin], remove); // Solo admin
router.get("/imagen-categorie/:img", get_imagen);

export default router;