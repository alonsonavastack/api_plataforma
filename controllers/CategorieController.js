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
            // TITLE
            // NUEVA IMAGEN
            // _ID
            // STATE
            const VALID_CATEGORIE = await models.Categorie.findOne({title: req.body.title, _id: {$ne: req.body._id}});
            if(VALID_CATEGORIE){
                res.status(200).json({
                    message: 403,
                    message_text: 'LA CATEGORIA YA EXISTE'
                });
                return;
            }

            if(req.files && req.files.imagen){
                // Si se sube una nueva imagen, eliminamos la anterior.
                const oldCategorie = await models.Categorie.findById(req.body._id);
                if (oldCategorie.imagen && fs.existsSync(path.join(__dirname, '../uploads/categorie/', oldCategorie.imagen))) {
                    fs.unlinkSync(path.join(__dirname, '../uploads/categorie/', oldCategorie.imagen));
                }

                const img_path = req.files.imagen.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
            }

            const NEditCategorie = await models.Categorie.findByIdAndUpdate(req.body._id, req.body, { new: true });

            res.status(200).json({
                categorie: resource.Categorie.api_resource_categorie(NEditCategorie),
            })
        } catch (error) {
            console.log(error);
            res.status(500).json({
                message: 'Hubo un error'
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
                res.status(500).send({
                    message: 'OCURRIO UN PROBLEMA'
                });
            }else{
                fs.stat('./uploads/categorie/'+img, function(err) {
                    if(!err){
                        let path_img = './uploads/categorie/'+img;
                        res.status(200).sendFile(path.resolve(path_img));
                    }else{
                        let path_img = path.join(__dirname, '../uploads/default.jpg');
                        res.status(200).sendFile(path.resolve(path_img));
                    }
                })
            }
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'OCURRIO UN PROBLEMA'
            });
        }
    };