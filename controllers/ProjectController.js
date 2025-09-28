import models from "../models/index.js";
import resource from "../resource/index.js";
import fs from 'fs';
import path from 'path';

// Necesitamos __dirname para manejar las rutas de archivos
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    // POST /api/project/register
    register: async (req, res) => {
        try {
            const existingProject = await models.Project.findOne({ title: req.body.title });
            if (existingProject) {
                return res.status(200).json({
                    message: 403,
                    message_text: "EL PROYECTO CON ESTE TÍTULO YA EXISTE"
                });
            }

            if (req.files && req.files.imagen) {
                const img_path = req.files.imagen.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
            }

            const newProject = await models.Project.create(req.body);

            res.status(200).json({
                project: resource.Project.api_resource_project(newProject),
                message: "EL PROYECTO SE REGISTRÓ CORRECTAMENTE"
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR"
            });
        }
    },

    // POST /api/project/update
    update: async (req, res) => {
        try {
            const existingProject = await models.Project.findOne({ title: req.body.title, _id: { $ne: req.body._id } });
            if (existingProject) {
                return res.status(200).json({
                    message: 403,
                    message_text: "EL PROYECTO CON ESTE TÍTULO YA EXISTE"
                });
            }

            if (req.files && req.files.imagen) {
                const oldProject = await models.Project.findById(req.body._id);
                if (oldProject.imagen && fs.existsSync(path.join(__dirname, '../uploads/project/', oldProject.imagen))) {
                    fs.unlinkSync(path.join(__dirname, '../uploads/project/', oldProject.imagen));
                }
                const img_path = req.files.imagen.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
            }

            const updatedProject = await models.Project.findByIdAndUpdate(req.body._id, req.body, { new: true });

            res.status(200).json({
                project: resource.Project.api_resource_project(updatedProject),
                message: "EL PROYECTO SE EDITÓ CORRECTAMENTE"
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR"
            });
        }
    },

    // GET /api/project/list
    list: async (req, res) => {
        try {
            const search = req.query.search;
            const categorie = req.query.categorie;
            const filter = {};

            if (search) {
                filter.title = new RegExp(search, "i");
            }
            if (categorie) {
                filter.categorie = categorie;
            }

            let projects = await models.Project.find(filter).populate("categorie");

            projects = projects.map(project => resource.Project.api_resource_project(project));

            res.status(200).json({
                projects: projects,
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR"
            });
        }
    },

    // GET /api/project/show/:id
    show_project: async (req, res) => {
        try {
            const project = await models.Project.findById(req.params.id).populate('categorie');
            if (!project) {
                return res.status(404).json({ message: 'Proyecto no encontrado' });
            }
            res.status(200).json({
                project: resource.Project.api_resource_project(project)
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR"
            });
        }
    },

    // DELETE /api/project/remove/:id
    remove: async (req, res) => {
        try {
            const project = await models.Project.findById(req.params.id);
            if (!project) {
                return res.status(404).json({ message: 'Proyecto no encontrado' });
            }

            if (project.imagen) {
                const imagePath = path.join(__dirname, '../uploads/project/', project.imagen);
                if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            }

            await models.Project.findByIdAndDelete(req.params.id);

            res.status(200).json({
                message: "EL PROYECTO SE ELIMINÓ CORRECTAMENTE"
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR"
            });
        }
    },

    // GET /api/project/imagen-project/:img
    get_imagen: async (req, res) => {
        const img = req.params["img"];
        const imagePath = path.join(__dirname, '../uploads/project/', img);
        const defaultImagePath = path.join(__dirname, '../uploads/default.jpg');

        fs.stat(imagePath, (err) => {
            if (!err) {
                res.status(200).sendFile(path.resolve(imagePath));
            } else {
                res.status(200).sendFile(path.resolve(defaultImagePath));
            }
        });
    },
}