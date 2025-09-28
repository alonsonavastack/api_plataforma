import models from "../models/index.js";
import resource from "../resource/index.js";

import fs from 'fs'
import path from 'path'

// Necesitamos __dirname para manejar las rutas de archivos en ES Modules
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { UploadVideoVimeo } from "../utils/vimeo.js";

export default {
    register: async(req,res) => {
        try {
            
            let IS_VALID_COURSE = await models.Course.findOne({title: req.body.title});
            if(IS_VALID_COURSE){
                res.status(200).json({
                    message: 403,
                    message_text: "EL CURSO INGRESADO YA EXISTE, INTENTE CON OTRO TITULO"
                });
                return;
            }

            req.body.slug = req.body.title.toLowerCase().replace(/ /g,'-').replace(/[^\w-]+/g,'');

            if(req.files && req.files.portada){
                const img_path = req.files.portada.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
            }

            const NewCourse = await models.Course.create(req.body);

            res.status(200).json({
                course: resource.Course.api_resource_course(NewCourse),
                message: "EL CURSO SE REGISTRÓ CORRECTAMENTE"
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    update: async(req,res) => {
        try {
            const IS_VALID_COURSE = await models.Course.findOne({title: req.body.title, _id: {$ne: req.body._id}});
            if(IS_VALID_COURSE){
                res.status(200).json({
                    message: 403,
                    message_text: "EL CURSO INGRESADO YA EXISTE, INTENTE CON OTRO TITULO"
                });
                return;
            }

            req.body.slug = req.body.title.toLowerCase().replace(/ /g,'-').replace(/[^\w-]+/g,'');

            if(req.files && req.files.portada){
                // Si se sube una nueva imagen, eliminamos la anterior.
                const oldCourse = await models.Course.findById(req.body._id);
                if (oldCourse.imagen && fs.existsSync(path.join(__dirname, '../uploads/course/', oldCourse.imagen))) {
                    fs.unlinkSync(path.join(__dirname, '../uploads/course/', oldCourse.imagen));
                }
                const img_path = req.files.portada.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
            }

            const EditCourse = await models.Course.findByIdAndUpdate(req.body._id, req.body, {
                new: true // Devuelve el documento actualizado
            });

            res.status(200).json({
                course: resource.Course.api_resource_course(EditCourse),
                message: "EL CURSO SE EDITÓ CORRECTAMENTE"
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    list: async(req,res) => {
        try {
            
            const search = req.query.search;
            const state = req.query.state;
            const categorie = req.query.categorie;

            const filter = {};

            if(search){
                filter.title = new RegExp(search,"i");
            }

            if(state){
                filter.state = state;
            }

            if(categorie){
                filter.categorie = categorie;
            }

            let courses = await models.Course.find(filter).populate(["categorie","user"]);

            courses = courses.map((course) => {
                return resource.Course.api_resource_course(course);
            });

            res.status(200).json({
                courses: courses,//NECESITAMOS PASARLE EL API RESOURCE
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    config_all: async(req,res) => {
        try {
            
            let Categories = await models.Categorie.find({state: 1});

            Categories = Categories.map((categorie) => {
                return {
                    _id: categorie._id,
                    title: categorie.title,
                }
            })

            let Users = await models.User.find({state: 1,rol: 'instructor'});

            Users = Users.map((user) => {
                return {
                    _id: user._id,
                    name: user.name,
                    surname: user.surname,
                }
            })
            res.status(200).json({
                categories: Categories,
                users: Users,
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    show_course: async(req,res) => {
        try {
            const course_id = req.params["id"];
            const Course = await models.Course.findById({_id: course_id});

            
            res.status(200).json({
                course: resource.Course.api_resource_course(Course),
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    remove: async(req,res) => {
        try {
            const course_id = req.params.id;

            // 1. VERIFICAR SI EL CURSO TIENE VENTAS
            const saleDetailCount = await models.SaleDetail.countDocuments({ product: course_id, product_type: 'course' });

            if (saleDetailCount > 0) {
                res.status(200).send({
                    message: 'EL CURSO NO SE PUEDE ELIMINAR, PORQUE YA TIENE VENTAS',
                    code: 403,
                });
                return;
            }

            // 2. SI NO TIENE VENTAS, PROCEDER CON LA ELIMINACIÓN EN CASCADA
            const course = await models.Course.findById(course_id);
            if (!course) {
                return res.status(404).send({ message: 'El curso no existe.' });
            }

            // Eliminar imagen de portada del curso
            if (course.imagen) {
                const imagePath = path.join(__dirname, '../uploads/course/', course.imagen);
                if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            }

            // Eliminar secciones, clases y archivos de clase asociados
            const sections = await models.CourseSection.find({ course: course_id });
            for (const section of sections) {
                const clases = await models.CourseClase.find({ section: section._id });
                for (const clase of clases) {
                    const claseFiles = await models.CourseClaseFile.find({ clase: clase._id });
                    for (const file of claseFiles) {
                        const filePath = path.join(__dirname, '../uploads/course/files/', file.file);
                        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                        await models.CourseClaseFile.findByIdAndDelete(file._id);
                    }
                    await models.CourseClase.findByIdAndDelete(clase._id);
                }
                await models.CourseSection.findByIdAndDelete(section._id);
            }

            // Finalmente, eliminar el curso y las inscripciones de estudiantes
            await models.CourseStudent.deleteMany({ course: course_id });
            await models.Course.findByIdAndDelete(course_id);

            res.status(200).send({
                message: 'EL CURSO Y TODOS SUS DATOS ASOCIADOS SE ELIMINARON CORRECTAMENTE',
                code: 200,
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    get_imagen: async(req,res) => {
        try {
            const img = req.params["img"];
            if(!img){
                res.status(500).send({
                    message: 'OCURRIO UN PROBLEMA'
                });
            }else{
                fs.stat('./uploads/course/'+img, function(err) {
                    let path_img;
                    if(!err){
                        path_img = './uploads/course/'+img;
                        res.status(200).sendFile(path.resolve(path_img));
                    }else{
                        // Si la imagen específica no se encuentra, servir una imagen por defecto
                        path_img = './uploads/default.jpg';
                        // Puedes agregar un log aquí para saber cuándo se está sirviendo la imagen por defecto
                        console.log(`Imagen no encontrada: ${img}. Sirviendo imagen por defecto.`);
                        res.status(200).sendFile(path.resolve(path_img));
                    }
                })
            }
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    upload_vimeo: async(req,res) => {
        try {
            const PathFile = req.files.video.path;
            const VideoMetaDato = {
                name: 'Video de prueba',
                description: 'Es un video para saber si la integración es correcta',
                privacy:{
                    view: 'anybody' // O 'nobody' si quieres que solo se vea embebido
                }
            }
            let vimeo_id_result = '';
            const result = await UploadVideoVimeo(PathFile,VideoMetaDato);
            if(result.message == 403){
                res.status(500).send({
                    message: 'HUBO UN ERROR'
                });
            }else{
                const ARRAY_VALUES = result.value.split("/");
                // /videos/852927231
                // ["","videos","852927231"]
                vimeo_id_result = ARRAY_VALUES[2];
                await models.Course.findByIdAndUpdate({_id: req.body._id},{
                    vimeo_id: vimeo_id_result
                })
    
                res.status(200).json({
                    message: 'LA PRUEBA FUE UN EXITO',
                    vimeo_id: "https://player.vimeo.com/video/"+vimeo_id_result,
                });
            }
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    }
}