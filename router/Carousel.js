import express from 'express';
import CarouselController from '../controllers/CarouselController.js';
import auth from '../service/auth.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// --- Configuración de Multer para la subida de archivos ---
const carouselUploadDir = './uploads/carousel';
// Asegurarse de que el directorio de subida exista
if (!fs.existsSync(carouselUploadDir)) {
    fs.mkdirSync(carouselUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, carouselUploadDir);
    },
    filename: function (req, file, cb) {
        // Crear un nombre de archivo único para evitar colisiones
        cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'));
    }
});

const fileFilter = (req, file, cb) => {
    // Aceptar solo estos tipos de imagen
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/webp') {
        cb(null, true);
    } else {
        cb(new Error('Formato de imagen no válido. Solo se permite JPG, PNG o WEBP.'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter, limits: { fileSize: 1024 * 1024 * 5 } }); // Límite de 5MB

// --- Definición de Rutas ---

// Rutas para administradores (protegidas con autenticación)
router.post('/register', [auth.verifyDashboard, upload.single('image')], CarouselController.register);
router.put('/update/:id', [auth.verifyDashboard, upload.single('image')], CarouselController.update);
router.delete('/remove/:id', auth.verifyDashboard, CarouselController.remove);
router.put('/update-order', auth.verifyDashboard, CarouselController.updateOrder);
router.get('/list', auth.verifyDashboard, CarouselController.list);

// Rutas públicas (accesibles sin autenticación)
router.get('/public_list', CarouselController.public_list);
router.get('/imagen/:img', CarouselController.get_image);

export default router;