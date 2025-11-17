import models from "../models/index.js";
import resource from "../resource/index.js";
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import * as RefundController from './RefundController.js';


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
                .sort({ createdAt: -1 })
                .lean(); // Usamos lean() para poder modificar los objetos

            // 1.2. Añadir lógica de reembolsos MEJORADA
            const now = new Date();
            const aWeekInMilliseconds = 7 * 24 * 60 * 60 * 1000;

            // ✅ Verificar elegibilidad con múltiples condiciones
            for (const sale of sales) {
                sale.isRefundable = false;
                sale.refundReason = null;
                
                if (sale.status === 'Pagado') {
                    const purchaseDate = new Date(sale.createdAt);
                    const timeSincePurchase = now.getTime() - purchaseDate.getTime();
                    const daysSincePurchase = Math.floor(timeSincePurchase / (24 * 60 * 60 * 1000));
                    const isWithinTimeLimit = timeSincePurchase < aWeekInMilliseconds;
                    
                    // Verificar si ya existe un reembolso
                    const existingRefund = await models.Refund.findOne({ 
                        sale: sale._id, 
                        status: { $in: ['pending', 'approved', 'processing', 'completed'] },
                        state: 1
                    });
                    
                    // Verificar si el instructor ya fue pagado
                    let instructorAlreadyPaid = false;
                    if (sale.detail && sale.detail.length > 0) {
                        for (const item of sale.detail) {
                            const paidEarnings = await models.InstructorEarnings.findOne({
                                sale: sale._id,
                                $or: [
                                    { course: item.product },
                                    { product_id: item.product }
                                ],
                                status: { $in: ['paid', 'completed'] }
                            });
                            if (paidEarnings) {
                                instructorAlreadyPaid = true;
                                break;
                            }
                        }
                    }
                    
                    // Determinar elegibilidad y razón
                    if (existingRefund) {
                        sale.refundReason = 'Ya existe una solicitud de reembolso';
                    } else if (!isWithinTimeLimit) {
                        sale.refundReason = `Período expirado (${daysSincePurchase} de 7 días)`;
                    } else if (instructorAlreadyPaid) {
                        sale.refundReason = 'El instructor ya fue pagado';
                    } else {
                        sale.isRefundable = true;
                        sale.daysRemaining = 7 - daysSincePurchase;
                    }
                }
            }

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

            // 🔥 MAPEAR REDES SOCIALES DESDE CAMPOS PLANOS A socialMedia
            if (req.body.facebook || req.body.instagram || req.body.youtube || 
                req.body.tiktok || req.body.twitch || req.body.website ||
                req.body.discord || req.body.linkedin || req.body.twitter || req.body.github) {
                req.body.socialMedia = {
                    facebook: req.body.facebook || '',
                    instagram: req.body.instagram || '',
                    youtube: req.body.youtube || '',
                    tiktok: req.body.tiktok || '',
                    twitch: req.body.twitch || '',
                    website: req.body.website || '',
                    discord: req.body.discord || '',
                    linkedin: req.body.linkedin || '',
                    twitter: req.body.twitter || '',
                    github: req.body.github || '',
                };
                // Limpiar campos planos
                delete req.body.facebook;
                delete req.body.instagram;
                delete req.body.youtube;
                delete req.body.tiktok;
                delete req.body.twitch;
                delete req.body.website;
                delete req.body.discord;
                delete req.body.linkedin;
                delete req.body.twitter;
                delete req.body.github;
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

// Nuevo endpoint para actualizar solo la contraseña con validación de la antigua
export const updatePassword = async(req, res) => {
    try {
        if (!req.user) {
            return res.status(401).send({ message: 'No autenticado.' });
        }

        const { old_password, password } = req.body;

        if (!old_password || !password) {
            return res.status(400).json({
                message_text: 'Debes proporcionar la contraseña actual y la nueva contraseña.'
            });
        }

        // Obtener el usuario actual
        const user = await models.User.findById(req.user._id);
        if (!user) {
            return res.status(404).send({ message: 'Usuario no encontrado.' });
        }

        // Verificar que la contraseña actual es correcta
        const isMatch = await bcrypt.compare(old_password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                message_text: 'La contraseña actual es incorrecta.'
            });
        }

        // Encriptar la nueva contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Actualizar solo la contraseña
        const updatedUser = await models.User.findByIdAndUpdate(
            req.user._id, 
            { password: hashedPassword }, 
            { new: true }
        );

        res.status(200).json({
            message: 'La contraseña se actualizó correctamente.',
            user: resource.User.api_resource_user(updatedUser),
        });
    } catch (error) {
        console.error('Error al actualizar contraseña:', error);
        res.status(500).send({ message: 'HUBO UN ERROR AL ACTUALIZAR LA CONTRASEÑA' });
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

// Nuevo endpoint para obtener las transacciones del estudiante
export const getTransactions = async(req, res) => {
    try {
        if (!req.user) {
            return res.status(401).send({ message: 'No autenticado.' });
        }

        // Obtener todas las ventas del usuario con detalles poblados
        const sales = await models.Sale.find({ user: req.user._id })
            .populate({
                path: 'detail.product',
                select: 'title imagen' // Solo seleccionamos los campos necesarios
            })
            .sort({ createdAt: -1 }); // Ordenar por fecha descendente

        // 1.2. Añadir lógica de reembolsos a las ventas obtenidas
        const now = new Date();
        const aWeekInMilliseconds = 7 * 24 * 60 * 60 * 1000;

        // ✅ Verificar elegibilidad con múltiples condiciones
        for (const sale of sales) {
            const saleObj = sale.toObject ? sale.toObject() : sale;
            saleObj.isRefundable = false;
            saleObj.refundReason = null;
            
            if (sale.status === 'Pagado') {
                const purchaseDate = new Date(sale.createdAt);
                const timeSincePurchase = now.getTime() - purchaseDate.getTime();
                const daysSincePurchase = Math.floor(timeSincePurchase / (24 * 60 * 60 * 1000));
                const isWithinTimeLimit = timeSincePurchase < aWeekInMilliseconds;
                
                // Verificar si ya existe un reembolso
                const existingRefund = await models.Refund.findOne({ 
                    sale: sale._id, 
                    status: { $in: ['pending', 'approved', 'processing', 'completed'] },
                    state: 1
                });
                
                // Verificar si el instructor ya fue pagado
                let instructorAlreadyPaid = false;
                const saleDetail = sale.detail || [];
                for (const item of saleDetail) {
                    const paidEarnings = await models.InstructorEarnings.findOne({
                        sale: sale._id,
                        $or: [
                            { course: item.product },
                            { product_id: item.product }
                        ],
                        status: { $in: ['paid', 'completed'] }
                    });
                    if (paidEarnings) {
                        instructorAlreadyPaid = true;
                        break;
                    }
                }
                
                // Determinar elegibilidad y razón
                if (existingRefund) {
                    saleObj.refundReason = 'Ya existe una solicitud de reembolso';
                } else if (!isWithinTimeLimit) {
                    saleObj.refundReason = `Período expirado (${daysSincePurchase} de 7 días)`;
                } else if (instructorAlreadyPaid) {
                    saleObj.refundReason = 'El instructor ya fue pagado';
                } else {
                    saleObj.isRefundable = true;
                    saleObj.daysRemaining = 7 - daysSincePurchase;
                }
            }
        }

        // Transformar las ventas a un formato de transacciones
        const transactions = sales.map(sale => {
            const saleObj = sale.toObject();
            return {
                _id: saleObj._id,
                n_transaccion: saleObj.n_transaccion,
                method_payment: saleObj.method_payment,
                total: saleObj.total,
                currency_total: saleObj.currency_total,
                status: saleObj.status,
                isRefundable: saleObj.isRefundable, // ✅ Añadir la propiedad a la respuesta
                items: saleObj.detail.map(item => ({
                    product: {
                        _id: item.product?._id || null,
                        title: item.title,
                        imagen: item.product?.imagen || null
                    },
                    product_type: item.product_type,
                    price: item.price_unit
                })),
                createdAt: saleObj.createdAt
            };
        });

        res.status(200).json({
            transactions
        });
    } catch (error) {
        console.error('Error al obtener transacciones:', error);
        res.status(500).send({ message: 'HUBO UN ERROR AL OBTENER LAS TRANSACCIONES' });
    }
};

// Nuevo endpoint para solicitar un reembolso
export const requestRefund = async(req, res) => {
    try {
        if (!req.user) {
            return res.status(401).send({ message: 'No autenticado.' });
        }

        const { sale_id, reason } = req.body;

        // Llamar a la función de requestRefund del RefundController
        return RefundController.requestRefund(req, res);

    } catch (error) {
        console.error('Error al solicitar reembolso desde el perfil del estudiante:', error);
        res.status(500).send({ message: 'HUBO UN ERROR AL PROCESAR LA SOLICITUD DE REEMBOLSO' });
    }
};
