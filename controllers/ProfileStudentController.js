import models from "../models/index.js";
import resource from "../resource/index.js";
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const client = async(req,res) => {
        try {
            if (!req.user) {
                return res.status(401).send({ message: 'No autenticado.' });
            }
            const student = await models.User.findById(req.user._id);

            if (!student) {
                return res.status(404).send({ message: 'Estudiante no encontrado.' });
            }

            // 1. Obtener los cursos en los que el estudiante está inscrito directamente
            let enrolled_courses = await models.CourseStudent.find({ user: req.user._id })
                .populate({
                    path: "course",
                    populate: {
                        path: "user" // Popula el instructor del curso
                    }
                });

            // 1.1 Calcular el porcentaje de completado para cada curso
            enrolled_courses = await Promise.all(enrolled_courses.map(async (enrollment) => {
                const enrollmentObj = enrollment.toObject();
                const courseId = enrollmentObj.course._id;

                // Contar el total de clases del curso
                const sections = await models.CourseSection.find({ course: courseId });
                const sectionIds = sections.map(s => s._id);
                const totalClases = await models.CourseClase.countDocuments({ section: { $in: sectionIds } });

                // Calcular porcentaje
                const checkedClases = enrollmentObj.clases_checked?.length || 0;
                enrollmentObj.percentage = totalClases > 0 ? Math.round((checkedClases / totalClases) * 100) : 0;
                return enrollmentObj;
            }));

            // 2. Obtener el historial de compras (opcional, pero útil para el perfil)
            const sales = await models.Sale.find({ user: req.user._id })
                .populate({
                    path: 'detail.product',
                    populate: [ // Populamos los campos anidados dentro del producto
                        { path: 'categorie' },
                        { path: 'user' }
                    ]
                })
                .sort({ createdAt: -1 });

            // 2.1. De la lista de ventas ya obtenida, filtramos para obtener solo los proyectos pagados.
            let projects = [];
            sales.forEach(sale => {
                if (sale.status === 'Pagado') {
                    sale.detail.forEach(item => {
                        if (item.product && item.product_type === 'project') {
                            // CORRECCIÓN: Pasamos el proyecto por el resource para asegurar que tenga
                            // todos los campos necesarios, incluyendo 'video_link'.
                            projects.push(resource.Project.api_resource_project(item.product));
                        }
                    });
                }
            });

            // 3. Calcular contadores de cursos
            const enrolled_course_count = enrolled_courses.length;
            const actived_course_count = enrolled_courses.filter(item => item.state === 1).length;
            const termined_course_count = enrolled_courses.filter(item => item.state === 2).length;
            res.status(200).json({
                profile: resource.User.api_resource_user(student),
                enrolled_courses: enrolled_courses,
                sales: sales,
                projects: projects, // 3. Añadimos los proyectos a la respuesta
                enrolled_course_count,
                actived_course_count,
                termined_course_count,
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({ message: 'HUBO UN ERROR' });
        }
    };

export const update = async(req,res) => {
        try {
            if (!req.user) {
                return res.status(401).send({ message: 'No autenticado.' });
            }

            // Validar si el correo electrónico ya está en uso por otro usuario
            if (req.body.email) {
                const existingUser = await models.User.findOne({email: req.body.email, _id: {$ne: req.user._id}});
                if(existingUser){
                    return res.status(200).json({
                        message: 403,
                        message_text: "El correo electrónico ya está en uso.",
                    });
                }
            }

            // Si se envía una nueva contraseña, la encriptamos.
            if(req.body.password){
                req.body.password = await bcrypt.hash(req.body.password, 10);
            }

            const updatedUser = await models.User.findByIdAndUpdate(req.user._id, req.body, { new: true });
            
            res.status(200).json({
                message: 'El perfil se actualizó correctamente.',
                user: resource.User.api_resource_user(updatedUser),
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({ message: 'HUBO UN ERROR' });
        }
    };

export const update_avatar = async(req,res) => {
    try {
        if (!req.user) {
            return res.status(401).send({ message: 'No autenticado.' });
        }

        if(req.files && req.files.avatar){
            const oldUser = await models.User.findById(req.user._id);
            if (oldUser.avatar && fs.existsSync(path.join(__dirname, '../uploads/user/', oldUser.avatar))) {
                fs.unlinkSync(path.join(__dirname, '../uploads/user/', oldUser.avatar));
            }
            const img_path = req.files.avatar.path;
            const avatar_name = path.basename(img_path);
            
            const updatedUser = await models.User.findByIdAndUpdate(req.user._id, { avatar: avatar_name }, { new: true });

            res.status(200).json({
                message: 'El avatar se actualizó correctamente.',
                user: resource.User.api_resource_user(updatedUser),
            });
        }
    } catch (error) {
        console.log(error);
        res.status(500).send({ message: 'HUBO UN ERROR' });
    }
};
