import models from "../models/index.js";
import token from "../service/token.js";

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

            // --- CORRECCIÓN ---
            // Los detalles de la orden ya están en el documento 'Orden' (la venta).
            // No necesitamos consultar 'SaleDetail' por separado.
            let OrdenDetail = Orden.detail;

            const transporter = nodemailer.createTransport(smtpTransport({
                service: 'gmail',
                host: 'smtp.gmail.com',
                auth: {
                    user: process.env.MAIL_USER,
                    pass: process.env.MAIL_PASSWORD
                }
            }));

            // Usar fs.promises para un código más limpio
            const html = await fs.promises.readFile(process.cwd() + '/mails/email_sale.html', 'utf-8');

            const mappedOrdenDetail = OrdenDetail.map((detail) => {
                // La población de 'product' se debe hacer al buscar la 'Orden'
                const productInfo = detail.product || {};
                const imagePath = productInfo.imagen || 'default.jpg';
                const imageType = detail.product_type === 'course' ? 'courses/imagen-course' : 'projects/imagen-project';
                
                return {
                    ...detail.toObject(),
                    portada: `${process.env.URL_BACKEND}/api/${imageType}/${imagePath}`
                };
            });

            const rest_html = ejs.render(html, { Orden: Orden, Orden_detail: mappedOrdenDetail });
            const htmlToSend = rest_html; // El HTML ya está listo después de EJS

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
            // El middleware 'auth.verifyTienda' ya decodificó el token y adjuntó el usuario a req.user.
            const Carts = await models.Cart.find({user: req.user._id}).populate('product');

            if (Carts.length === 0) {
                return res.status(400).send({ message: 'No hay artículos en el carrito.' });
            }

            // Construimos el objeto de la venta con todos sus datos
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

            // --- INICIO DE LA LÓGICA MEJORADA ---

            // Si el pago fue exitoso (no es transferencia), inscribimos al estudiante a los cursos.
            if (Sale.status === 'Pagado') {
                for (const item of Sale.detail) {
                    if (item.product_type === 'course') {
                        await enrollStudent(req.user._id, item.product);
                    }
                }
            }

            // Limpiamos el carrito del usuario de una sola vez
            await models.Cart.deleteMany({ user: req.user._id });

            // Enviamos el correo de confirmación
            try {
                await send_email(Sale._id);
            } catch (emailError) {
                // Opcional: Registrar el error de correo sin detener la respuesta exitosa al cliente.
                console.error("El registro de la venta fue exitoso, pero el correo de confirmación no pudo ser enviado.");
            }
            // --- FIN DE LA LÓGICA MEJORADA ---

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

    // --- INICIO DE LA FUNCIÓN AUXILIAR ---
    // Esta función se puede reutilizar en otros lugares si es necesario.
    // Se mueve fuera del controlador para mantenerlo limpio.
    // (Añadir al final del archivo, antes del `export default`)
    // --- FIN DE LA FUNCIÓN AUXILIAR ---

    list: async (req, res) => {
        try {
            // El middleware auth.verifyAdmin ya valida que el rol sea 'admin'
            const { search, status } = req.query;

            let filter = {};

            if (status) {
                filter.status = status;
            }

            if (search) {
                // Buscar por número de transacción o por datos del usuario
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

            const sales = await models.Sale.find(filter)
                .populate('user', 'name surname email')
                .populate({
                    path: 'detail.product', // Poblar el producto dentro del array de detalles
                    select: 'title imagen' // Seleccionar solo los campos que necesitamos para la lista
                })
                .sort({ createdAt: -1 });

            res.status(200).json({ sales });

        } catch (error) {
            console.error("Error en SaleController.list:", error);
            res.status(500).send({ message: "OCURRIÓ UN ERROR AL OBTENER LAS VENTAS" });
        }
    },

    /**
     * Actualiza el estado de una venta.
     * Especialmente útil para que el admin confirme pagos por transferencia.
     */
    update_status_sale: async (req, res) => {
      try {
        // Solo administradores pueden ejecutar esta acción
        if (req.user.rol !== 'admin') {
          return res.status(403).send({ message_text: 'No tienes permiso para realizar esta acción.' });
        }
    
        const { id } = req.params;
        const { status } = req.body; // Esperamos un nuevo estado, ej: 'Pagado'
    
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
    
        // --- INICIO DE LA LÓGICA AÑADIDA ---
        // Si el estado anterior era diferente y el nuevo es 'Pagado',
        // procedemos a inscribir al estudiante.
        if (oldStatus !== 'Pagado' && status === 'Pagado') {
          for (const item of sale.detail) {
            if (item.product_type === 'course') {
              // Verificamos si ya existe una inscripción para evitar duplicados
              const existingEnrollment = await models.CourseStudent.findOne({
                user: sale.user._id,
                course: item.product._id,
              });
    
              if (!existingEnrollment) {
                await models.CourseStudent.create({ user: sale.user._id, course: item.product._id });
                console.log(`Curso ${item.product.title} habilitado para usuario ${sale.user.email} tras confirmación de pago.`);
              }
            }
            // Para los proyectos, el acceso se basa en que la venta esté 'Pagada',
            // por lo que no se necesita una acción adicional aquí.
          }
        }
        // --- FIN DE LA LÓGICA AÑADIDA ---
    
        res.status(200).json({ message_text: 'Estado de la venta actualizado correctamente.', sale: sale });
    
      } catch (error) {
        console.error(error);
        res.status(500).send({ message_text: 'Error interno del servidor.' });
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
        // Considera un mecanismo para reintentar o notificar este error.
    }
}