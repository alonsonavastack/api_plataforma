import models from '../models/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    // POST: /api/carousel/register
    register: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'No se ha subido ninguna imagen.' });
            }
            req.body.imageUrl = req.file.filename;
            const newCarouselImage = await models.CarouselImage.create(req.body);
            res.status(201).json(newCarouselImage);
        } catch (error) {
            console.error("Error en CarouselController.register:", error);
            res.status(500).json({ message: 'Error al registrar la imagen del carrusel.', error });
        }
    },

    // PUT: /api/carousel/update/:id
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const data = req.body;

            const oldImage = await models.CarouselImage.findById(id);
            if (!oldImage) {
                return res.status(404).json({ message: 'Imagen del carrusel no encontrada.' });
            }

            if (req.file) {
                // Si se sube una nueva imagen, eliminar la anterior del servidor
                const oldImagePath = path.join(__dirname, '../uploads/carousel/', oldImage.imageUrl);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
                data.imageUrl = req.file.filename;
            }

            const updatedImage = await models.CarouselImage.findByIdAndUpdate(id, data, { new: true });
            res.status(200).json(updatedImage);
        } catch (error) {
            console.error("Error en CarouselController.update:", error);
            res.status(500).json({ message: 'Error al actualizar la imagen del carrusel.', error });
        }
    },

    // DELETE: /api/carousel/remove/:id
    remove: async (req, res) => {
        try {
            const { id } = req.params;
            const imageToDelete = await models.CarouselImage.findById(id);

            if (!imageToDelete) {
                return res.status(404).json({ message: 'Imagen del carrusel no encontrada.' });
            }

            // Eliminar el archivo físico del servidor
            const imagePath = path.join(__dirname, '../uploads/carousel/', imageToDelete.imageUrl);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }

            await models.CarouselImage.findByIdAndDelete(id);
            res.status(200).json({ message: 'Imagen del carrusel eliminada correctamente.' });
        } catch (error) {
            console.error("Error en CarouselController.remove:", error);
            res.status(500).json({ message: 'Error al eliminar la imagen del carrusel.', error });
        }
    },

    // GET: /api/carousel/list (para el admin)
    list: async (req, res) => {
        try {
            const images = await models.CarouselImage.find().sort({ order: 1 });
            res.status(200).json(images);
        } catch (error) {
            res.status(500).json({ message: 'Error al listar las imágenes del carrusel.', error });
        }
    },

    // GET: /api/carousel/public_list (para la home)
    public_list: async (req, res) => {
        try {
            const images = await models.CarouselImage.find({ isActive: true }).sort({ order: 1 });
            res.status(200).json(images);
        } catch (error) {
            res.status(500).json({ message: 'Error al listar las imágenes públicas del carrusel.', error });
        }
    },

    // GET: /api/carousel/imagen/:img
    get_image: (req, res) => {
        try {
            const img = req.params.img;
            const imagePath = path.join(__dirname, '../uploads/carousel/', img);

            if (fs.existsSync(imagePath)) {
                res.status(200).sendFile(path.resolve(imagePath));
            } else {
                res.status(404).json({ message: 'Imagen no encontrada.' });
            }
        } catch (error) {
            res.status(500).json({ message: 'Error al obtener la imagen.', error });
        }
    },

    // PUT: /api/carousel/update-order
    updateOrder: async (req, res) => {
        try {
            const { updates } = req.body;

            if (!Array.isArray(updates)) {
                return res.status(400).json({ message: 'Formato de datos inválido. Se esperaba un array.' });
            }

            const bulkOps = updates.map(item => ({
                updateOne: {
                    filter: { _id: item._id },
                    update: { $set: { order: item.order } }
                }
            }));

            await models.CarouselImage.bulkWrite(bulkOps);

            res.status(200).json({ message: 'Orden actualizado correctamente.' });
        } catch (error) {
            res.status(500).json({ message: 'Error al actualizar el orden de las imágenes.', error });
        }
    }
};