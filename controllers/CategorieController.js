import models from "../models/index.js";
import resource from "../resource/index.js";
import mongoose from "mongoose";

import fs from 'fs'
import path from 'path'

// Necesitamos __dirname para manejar las rutas de archivos en ES Modules
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const register = async(req,res) => {
        try {
            
            const VALID_CATEGORIE = await models.Categorie.findOne({title: req.body.title});
            if(VALID_CATEGORIE){
                res.status(200).json({
                    message: 403,
                    message_text: 'LA CATEGORIA YA EXISTE'
                });
                return;
            }

            if(req.files && req.files.imagen){
                const img_path = req.files.imagen.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
            }

            const NewCategorie = await models.Categorie.create(req.body);

            res.status(200).json({
                categorie: resource.Categorie.api_resource_categorie(NewCategorie),
            })
        } catch (error) {
            console.log(error);
            res.status(500).json({
                message: 'Hubo un error'
            });
        }
    };
export const update = async(req,res) => {
        try {
            // Buscar la categoría actual ANTES de hacer cambios
            const oldCategorie = await models.Categorie.findById(req.body._id);
            
            if (!oldCategorie) {
                return res.status(404).json({
                    message: 404,
                    message_text: 'CATEGORIA NO ENCONTRADA'
                });
            }

            // Validar título duplicado
            const VALID_CATEGORIE = await models.Categorie.findOne({
                title: req.body.title, 
                _id: {$ne: req.body._id}
            });
            
            if(VALID_CATEGORIE){
                return res.status(200).json({
                    message: 403,
                    message_text: 'LA CATEGORIA YA EXISTE'
                });
            }

            // 🎯 CRÍTICO: Manejo correcto de imágenes
            if(req.files && req.files.imagen){
                // Si se sube una nueva imagen, eliminamos la anterior
                if (oldCategorie.imagen) {
                    const oldImagePath = path.join(__dirname, '../uploads/categorie/', oldCategorie.imagen);
                    if (fs.existsSync(oldImagePath)) {
                        try {
                            fs.unlinkSync(oldImagePath);
                            console.log('✅ Imagen anterior eliminada:', oldCategorie.imagen);
                        } catch (err) {
                            console.warn('⚠️ No se pudo eliminar imagen anterior:', err);
                        }
                    }
                }

                // Guardar la nueva imagen
                const img_path = req.files.imagen.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
                
                console.log('✅ Nueva imagen guardada:', imagen_name);
            } else {
                // 🔥 IMPORTANTE: Si NO se sube imagen nueva, mantener la anterior
                if (oldCategorie.imagen) {
                    req.body.imagen = oldCategorie.imagen;
                    console.log('✅ Manteniendo imagen anterior:', oldCategorie.imagen);
                }
            }

            // Actualizar la categoría
            const NEditCategorie = await models.Categorie.findByIdAndUpdate(
                req.body._id, 
                req.body, 
                { new: true }
            );

            console.log('✅ Categoría actualizada:', NEditCategorie.title);

            res.status(200).json({
                categorie: resource.Categorie.api_resource_categorie(NEditCategorie),
            });
            
        } catch (error) {
            console.error('❌ Error en update:', error);
            res.status(500).json({
                message: 'Hubo un error al actualizar la categoría'
            });
        }
    };
export const list = async(req,res) => {
        try {
            const search = req.query.search;
            const state = req.query.state;
            let match_filter = {};

            if(search){
                match_filter.title = new RegExp(search, "i");
            }
            if(state){
                // El estado en el modelo es booleano, así que convertimos el string 'true'/'false'
                match_filter.state = state === 'true';
            }

            // OPTIMIZACIÓN: Usar agregación para contar los cursos asociados
            const CategorieList = await models.Categorie.aggregate([
                { $match: match_filter },
                { $sort: { createdAt: -1 } },
                {
                    $lookup: {
                        from: "courses",
                        localField: "_id",
                        foreignField: "categorie",
                        as: "courses"
                    }
                }
            ]).exec();

            res.status(200).json({
                categories: CategorieList,
            })
        } catch (error) {
            console.log(error);
            res.status(500).json({
                message: 'Hubo un error'
            });
        }
    };
export const remove = async(req,res) => {
        try {
            let categorie_id = req.params["id"];

            // Validar que la categoría no esté en uso
            const courseCount = await models.Course.countDocuments({ categorie: categorie_id });
            const projectCount = await models.Project.countDocuments({ categorie: categorie_id });

            if (courseCount > 0 || projectCount > 0) {
                return res.status(200).json({
                    message: 403,
                    message_text: 'No se puede eliminar la categoría porque está asignada a uno o más cursos/proyectos.'
                });
            }

            // Eliminar la categoría y su imagen
            const Categorie = await models.Categorie.findById({_id: categorie_id});
            if (Categorie.imagen) {
                const imagePath = path.join(__dirname, '../uploads/categorie/', Categorie.imagen);
                if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            }
            await models.Categorie.findByIdAndDelete(categorie_id);

            res.status(200).json({
                message: 'La categoria se elimino correctamente'
            });
        } catch (error) {
            console.log(error);
            res.status(500).json({
                message: 'Hubo un error'
            });
        }
    };
export const get_imagen = async(req,res) => {
        try {
            const img = req.params["img"];
            
            if(!img){
                return res.status(400).send({
                    message: 'NO SE PROPORCIONÓ NOMBRE DE IMAGEN'
                });
            }

            const imagePath = path.join(__dirname, '../uploads/categorie/', img);
            
            fs.stat(imagePath, function(err) {
                if(!err && fs.existsSync(imagePath)){
                    // Imagen existe, enviarla
                    res.status(200).sendFile(path.resolve(imagePath));
                } else {
                    // Imagen no existe, enviar placeholder
                    console.warn('⚠️ Imagen no encontrada:', img);
                    const defaultPath = path.join(__dirname, '../uploads/default.jpg');
                    res.status(200).sendFile(path.resolve(defaultPath));
                }
            });
            
        } catch (error) {
            console.error('❌ Error en get_imagen:', error);
            const defaultPath = path.join(__dirname, '../uploads/default.jpg');
            res.status(200).sendFile(path.resolve(defaultPath));
        }
    };

export const list_public = async(req,res) => {
    try {
        // Este endpoint es público, no requiere autenticación.
        // Devuelve solo las categorías activas (state: 1).
        const categories = await models.Categorie.find({state: 1}).sort({'createdAt': -1});

        res.status(200).json({
            categories: categories.map(cat => resource.Categorie.api_resource_categorie(cat))
        });

    } catch (error) {
        console.log(error);
        res.status(500).send({
            message: "OCURRIO UN PROBLEMA"
        });
    }
}