import express from "express";
import SettingController, { path_uploads } from "../controllers/SettingController.js";
import auth from "../service/auth.js";

const router = express.Router();

// 📋 Obtener toda la configuración del sistema
router.get("/all", auth.verifyAdmin, SettingController.getAll);

// 📝 Actualizar configuración del sistema (sin logo)
router.put("/update", auth.verifyAdmin, SettingController.update);

// 🖼️ Actualizar logo del sistema
router.post("/update-logo", [auth.verifyAdmin, path_uploads], SettingController.updateLogo);

// 🖼️ Obtener imagen del logo
router.get("/logo/:filename", SettingController.getLogo);

// 🗑️ Eliminar logo del sistema
router.delete("/delete-logo", auth.verifyAdmin, SettingController.deleteLogo);

// 🔄 Restablecer configuración por defecto
router.post("/reset", auth.verifyAdmin, SettingController.reset);

export default router;
