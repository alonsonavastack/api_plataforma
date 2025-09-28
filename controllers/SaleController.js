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

            let OrdenDetail = await models.SaleDetail.find({ sale: Orden._id }).populate('product');

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
                if (detail.product_type === 'course') {
                    return { ...detail.toObject(), portada: `${process.env.URL_BACKEND}/api/courses/imagen-course/${detail.product.imagen}` };
                } else if (detail.product_type === 'project') {
                    return { ...detail.toObject(), portada: `${process.env.URL_BACKEND}/api/projects/imagen-project/${detail.product.imagen}` };
                }
                return detail.toObject();
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
            
            const user = await token.decode(req.headers.token);

            req.body.user = user._id;
            const Sale = await models.Sale.create(req.body);

            const Carts = await models.Cart.find({user: user._id});

            for (const Cart of Carts) {
                Cart = Cart.toObject();
                Cart.sale = Sale._id;
                // El modelo SaleDetail ya tiene product_type y product, así que se guarda correctamente.
                await models.SaleDetail.create(Cart);
                
                // Si es un curso, se inscribe al estudiante. Si es un proyecto, ya tiene acceso.
                if (Cart.product_type === 'course') {
                    // LA HABILITACION DEL CURSO AL ESTUDIANTE QUE SE HA INSCRITO
                    await models.CourseStudent.create({ user: user._id, course: Cart.product });
                }
                // 
                await models.Cart.findByIdAndDelete({_id: Cart._id});
            }

            // IRIA EL ENVIO DE EMAIL
            try {
                await send_email(Sale._id);
            } catch (emailError) {
                // Opcional: Registrar el error de correo sin detener la respuesta exitosa al cliente.
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
    }
}