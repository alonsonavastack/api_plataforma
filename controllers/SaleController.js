import models from "../models/index.js";
import token from "../service/token.js";
import { emitNewSaleToAdmins, emitSaleStatusUpdate } from '../services/socket.service.js';
import { notifyNewSale } from '../services/telegram.service.js';

import fs from 'fs';
import handlebars from 'handlebars';
import ejs from 'ejs';
import nodemailer from 'nodemailer';
import smtpTransport from 'nodemailer-smtp-transport';

async function send_email (sale_id) {
    return new Promise(async (resolve, reject) => {
        try {
            const SALE_ID = sale_id;

            const Orden = await models.Sale.findById(SALE_ID).populate("user");
            if (!Orden) {
                return reject({ message: "Venta no encontrada" });
            }

            let OrdenDetail = Orden.detail;

            const transporter = nodemailer.createTransport(smtpTransport({
                service: 'gmail',
                host: 'smtp.gmail.com',
                auth: {
                    user: process.env.MAIL_USER,
                    pass: process.env.MAIL_PASSWORD
                }
            }));

            const html = await fs.promises.readFile(process.cwd() + '/mails/email_sale.html', 'utf-8');

            const mappedOrdenDetail = OrdenDetail.map((detail) => {
                const productInfo = detail.product || {};
                const imagePath = productInfo.imagen || 'default.jpg';
                const imageType = detail.product_type === 'course' ? 'courses/imagen-course' : 'projects/imagen-project';
                
                return {
                    ...detail.toObject(),
                    portada: `${process.env.URL_BACKEND}/api/${imageType}/${imagePath}`
                };
            });

            const rest_html = ejs.render(html, { Orden: Orden, Orden_detail: mappedOrdenDetail });
            const htmlToSend = rest_html;

            const mailOptions = {
                from: process.env.MAIL_USER,
                to: Orden.user.email,
                subject: 'Confirmación de tu compra ' + Orden._id,
                html: htmlToSend
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error("Error al enviar el correo:", error);
                    return reject(error);
                }
                console.log('Email sent: ' + info.response);
                resolve(info);
            });
        } catch (error) {
            console.error("Error en la función send_email:", error);
            reject(error);
        }
    });
}

export default {
    register: async(req,res) => {
        try {
            const Carts = await models.Cart.find({user: req.user._id}).populate('product');

            if (Carts.length === 0) {
                return res.status(400).send({ message: 'No hay artículos en el carrito.' });
            }

            const saleData = {
                ...req.body,
                user: req.user._id,
                detail: Carts.map(cart => ({
                    product: cart.product._id,
                    product_type: cart.product_type,
                    title: cart.product.title,
                    price_unit: cart.price_unit,
                    discount: cart.discount,
                    type_discount: cart.type_discount,
                })),
                status: req.body.method_payment !== 'transfer' ? 'Pagado' : 'Pendiente'
            };
            
            const Sale = await models.Sale.create(saleData);

            // Emitir evento de nueva venta a los admins via WebSocket
            const saleWithUser = await models.Sale.findById(Sale._id).populate('user', 'name surname email');
            emitNewSaleToAdmins(saleWithUser);
            console.log('🔔 WebSocket: Nueva venta emitida a admins');

            // 📨 Enviar notificación a Telegram
            try {
                await notifyNewSale(saleWithUser);
            } catch (telegramError) {
                console.error('⚠️  La notificación de Telegram falló, pero la venta se registró correctamente:', telegramError.message);
            }

            if (Sale.status === 'Pagado') {
                for (const item of Sale.detail) {
                    if (item.product_type === 'course') {
                        await enrollStudent(req.user._id, item.product);
                    }
                }
            }

            await models.Cart.deleteMany({ user: req.user._id });

            try {
                await send_email(Sale._id);
            } catch (emailError) {
                console.error("El registro de la venta fue exitoso, pero el correo de confirmación no pudo ser enviado.");
            }

            res.status(200).json({
                message: 'LA ORDEN SE GENERO CORRECTAMENTE',
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'OCURRIO UN PROBLEMA'
            });
        }
    },

    list: async (req, res) => {
        try {
            const { search, status, month, year } = req.query;

            let filter = { status: { $ne: 'Anulado' } };

            if (status) {
                filter.status = status;
            }

            // Filtro por mes y año
            if (month && year) {
                const startDate = new Date(year, month - 1, 1);
                const endDate = new Date(year, month, 0, 23, 59, 59, 999);
                filter.createdAt = { $gte: startDate, $lte: endDate };
            } else if (year) {
                const startDate = new Date(year, 0, 1);
                const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
                filter.createdAt = { $gte: startDate, $lte: endDate };
            }

            if (search) {
                const userQuery = {
                    $or: [
                        { name: new RegExp(search, "i") },
                        { surname: new RegExp(search, "i") },
                        { email: new RegExp(search, "i") },
                    ],
                };
                const users = await models.User.find(userQuery).select('_id');
                const userIds = users.map(u => u._id);

                filter.$or = [
                    { n_transaccion: new RegExp(search, "i") },
                    { user: { $in: userIds } }
                ];
            }

            // Si el usuario es un instructor, filtramos las ventas para mostrar solo las de sus cursos y proyectos.
            if (req.user.rol === 'instructor') {
                // Encontrar cursos del instructor
                const instructorCourses = await models.Course.find({ user: req.user._id }).select('_id');
                const courseIds = instructorCourses.map(c => c._id);

                // Encontrar proyectos del instructor
                const instructorProjects = await models.Project.find({ user: req.user._id }).select('_id');
                const projectIds = instructorProjects.map(p => p._id);

                // Combinar ambos arrays
                const allProductIds = [...courseIds, ...projectIds];
                const allProductIdStrings = allProductIds.map(id => id.toString());

                // Filtrar ventas que contengan al menos uno de esos productos
                filter['detail'] = {
                    $elemMatch: {
                        product: { $in: allProductIds }
                    }
                };

                // Obtener las ventas
                let sales = await models.Sale.find(filter)
                    .populate('user', 'name surname email')
                    .populate({
                        path: 'detail.product',
                        select: 'title imagen user',
                        populate: {
                            path: 'user',
                            select: 'name surname'
                        }
                    })
                    .sort({ createdAt: -1 })
                    .lean(); // Usar lean() para poder modificar los objetos

                // FILTRAR los detalles para mostrar SOLO los productos del instructor
                sales = sales.map(sale => {
                    // Filtrar el array de detalles
                    const filteredDetails = sale.detail.filter(item => 
                        item.product && allProductIdStrings.includes(item.product._id.toString())
                    );

                    // Recalcular el total basado solo en los productos del instructor
                    const instructorTotal = filteredDetails.reduce((sum, item) => sum + item.price_unit, 0);

                    return {
                        ...sale,
                        detail: filteredDetails,
                        total: instructorTotal, // Total solo de sus productos
                        _id: sale._id.toString() // Asegurar que el ID sea string
                    };
                });

                // Eliminar ventas que quedaron sin detalles (por si acaso)
                sales = sales.filter(sale => sale.detail.length > 0);

                return res.status(200).json({ sales });

            } else {
                // Admin ve todas las ventas sin filtrar
                const sales = await models.Sale.find(filter)
                    .populate('user', 'name surname email')
                    .populate({
                        path: 'detail.product',
                        select: 'title imagen user',
                        populate: {
                            path: 'user',
                            select: 'name surname'
                        }
                    })
                    .sort({ createdAt: -1 });

                return res.status(200).json({ sales });
            }

        } catch (error) {
            console.error("Error en SaleController.list:", error);
            res.status(500).send({ message: "OCURRIÓ UN ERROR AL OBTENER LAS VENTAS" });
        }
    },

    update_status_sale: async (req, res) => {
      try {
        if (req.user.rol !== 'admin') {
          return res.status(403).send({ message_text: 'No tienes permiso para realizar esta acción.' });
        }
    
        const { id } = req.params;
        const { status } = req.body;
    
        if (!status) {
          return res.status(400).send({ message_text: 'El nuevo estado es requerido.' });
        }
    
        const sale = await models.Sale.findById(id).populate('user').populate('detail.product');
        if (!sale) {
          return res.status(404).send({ message_text: 'Venta no encontrada.' });
        }
    
        const oldStatus = sale.status;
        sale.status = status;
        await sale.save();

        // Emitir evento de actualización de estado via WebSocket
        emitSaleStatusUpdate(sale);
        console.log('🔄 WebSocket: Estado de venta actualizado y emitido');
    
        if (oldStatus !== 'Pagado' && status === 'Pagado') {
          for (const item of sale.detail) {
            if (item.product_type === 'course') {
              const existingEnrollment = await models.CourseStudent.findOne({
                user: sale.user._id,
                course: item.product._id,
              });
    
              if (!existingEnrollment) {
                await models.CourseStudent.create({ user: sale.user._id, course: item.product._id });
                console.log(`Curso ${item.product.title} habilitado para usuario ${sale.user.email} tras confirmación de pago.`);
              }
            }
          }
        }
    
        res.status(200).json({ message_text: 'Estado de la venta actualizado correctamente.', sale: sale });
    
      } catch (error) {
        console.error(error);
        res.status(500).send({ message_text: 'Error interno del servidor.' });
      }
    },

    // Obtener transacciones del usuario actual (estudiante)
    my_transactions: async (req, res) => {
        try {
            const userId = req.user._id;

            const sales = await models.Sale.find({ user: userId })
                .populate({
                    path: 'detail.product',
                    select: 'title imagen'
                })
                .sort({ createdAt: -1 })
                .lean();

            // Formatear la respuesta para el frontend
            const transactions = sales.map(sale => ({
                _id: sale._id,
                n_transaccion: sale.n_transaccion,
                method_payment: sale.method_payment,
                status: sale.status,
                total: sale.total,
                currency_total: sale.currency_total,
                createdAt: sale.createdAt,
                items: sale.detail.map(item => ({
                    product_id: item.product?._id,
                    product_type: item.product_type,
                    title: item.title || item.product?.title,
                    imagen: item.product?.imagen,
                    price_unit: item.price_unit,
                    discount: item.discount,
                    type_discount: item.type_discount
                }))
            }));

            res.status(200).json({ transactions });
        } catch (error) {
            console.error('Error en my_transactions:', error);
            res.status(500).send({ message: 'Error al obtener las transacciones' });
        }
    },

    // Buscar transacción por número de transacción
    get_by_transaction: async (req, res) => {
        try {
            const { n_transaccion } = req.params;
            const userId = req.user._id;

            // Buscar la transacción que pertenezca al usuario
            const sale = await models.Sale.findOne({ 
                n_transaccion: n_transaccion,
                user: userId 
            })
            .populate({
                path: 'detail.product',
                select: 'title imagen'
            })
            .lean();

            if (!sale) {
                return res.status(404).json({ 
                    message: 'Transacción no encontrada o no tienes permiso para verla' 
                });
            }

            // Formatear la respuesta
            const transaction = {
                _id: sale._id,
                n_transaccion: sale.n_transaccion,
                method_payment: sale.method_payment,
                status: sale.status,
                total: sale.total,
                currency_total: sale.currency_total,
                currency_payment: sale.currency_payment,
                price_dolar: sale.price_dolar,
                createdAt: sale.createdAt,
                updatedAt: sale.updatedAt,
                items: sale.detail.map(item => ({
                    product_id: item.product?._id,
                    product_type: item.product_type,
                    title: item.title || item.product?.title,
                    imagen: item.product?.imagen,
                    price_unit: item.price_unit,
                    discount: item.discount,
                    type_discount: item.type_discount
                }))
            };

            res.status(200).json({ transaction });
        } catch (error) {
            console.error('Error en get_by_transaction:', error);
            res.status(500).send({ message: 'Error al buscar la transacción' });
        }
    },

    // 🔔 Obtener notificaciones recientes (solo admin)
    recent_notifications: async (req, res) => {
        try {
            const { limit = 10, minutes = 1440 } = req.query; // 24 horas por defecto
            
            // Calcular timestamp hace X minutos
            const cutoffTime = new Date();
            cutoffTime.setMinutes(cutoffTime.getMinutes() - parseInt(minutes));
            
            console.log('🔔 Buscando notificaciones desde:', cutoffTime);
            
            // Buscar ventas recientes (sin filtro de tiempo para debug)
            const recentSales = await models.Sale.find({})
            .populate('user', 'name surname email')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .lean();
            
            console.log('📊 Total ventas encontradas:', recentSales.length);
            
            // Contar ventas con estado "Pendiente"
            const unreadCount = recentSales.filter(sale => sale.status === 'Pendiente').length;
            
            // Formatear la respuesta
            const formattedSales = recentSales.map(sale => ({
                _id: sale._id,
                n_transaccion: sale.n_transaccion,
                total: sale.total,
                currency_total: sale.currency_total,
                status: sale.status,
                createdAt: sale.createdAt,
                user: {
                    _id: sale.user._id,
                    name: sale.user.name,
                    surname: sale.user.surname,
                    email: sale.user.email
                }
            }));
            
            console.log('✅ Enviando respuesta con', formattedSales.length, 'notificaciones');
            
            res.status(200).json({
                recent_sales: formattedSales,
                unread_count: unreadCount
            });
            
        } catch (error) {
            console.error('❌ Error al obtener notificaciones:', error);
            res.status(500).json({ 
                message: 'Error al cargar notificaciones',
                error: error.message 
            });
        }
    },

    // 🔔 Marcar notificaciones como leídas (solo admin)
    mark_notifications_read: async (req, res) => {
        try {
            const { timestamp } = req.body;
            const userId = req.user._id;
            
            // Por ahora solo retornamos success
            // En el futuro podrías guardar esto en una colección de "notificaciones leídas"
            console.log(`👁️ Admin ${userId} marcó notificaciones como leídas en ${timestamp}`);
            
            res.status(200).json({
                success: true,
                message: 'Notificaciones marcadas como leídas'
            });
            
        } catch (error) {
            console.error('❌ Error al marcar notificaciones:', error);
            res.status(500).json({ 
                message: 'Error al marcar notificaciones',
                error: error.message 
            });
        }
    },
}

/**
 * Inscribe a un estudiante en un curso, evitando duplicados.
 * @param {string} userId - ID del usuario a inscribir.
 * @param {string} courseId - ID del curso.
 */
async function enrollStudent(userId, courseId) {
    try {
        const existingEnrollment = await models.CourseStudent.findOne({
            user: userId,
            course: courseId,
        });

        if (!existingEnrollment) {
            await models.CourseStudent.create({ user: userId, course: courseId });
            console.log(`Inscripción creada para usuario ${userId} en curso ${courseId}.`);
        }
    } catch (error) {
        console.error(`Error al inscribir al estudiante ${userId} en el curso ${courseId}:`, error);
    }
}
