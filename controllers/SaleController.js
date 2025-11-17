import models from "../models/index.js";
import token from "../service/token.js";
import { emitNewSaleToAdmins, emitSaleStatusUpdate } from '../services/socket.service.js';
import { notifyNewSale } from '../services/telegram.service.js';
import { useWalletBalance } from './WalletController.js'; // ✅ IMPORTAR FUNCIÓN DE WALLET

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
            console.log('🛍️ [SaleController.register] Iniciando registro de venta...');
            console.log('💰 Uso de billetera:', req.body.use_wallet);
            console.log('💵 Monto de billetera:', req.body.wallet_amount);
            
            const Carts = await models.Cart.find({user: req.user._id}).populate('product');

            if (Carts.length === 0) {
                return res.status(400).send({ message: 'No hay artículos en el carrito.' });
            }

            const total = req.body.total;

            // 🆕 VALIDAR Y PROCESAR BILLETERA
            let walletAmount = 0;
            let remainingAmount = total;
            let walletTransaction = null;
            
            if (req.body.use_wallet && req.body.wallet_amount > 0) {
                walletAmount = parseFloat(req.body.wallet_amount);
                remainingAmount = total - walletAmount;
                
                console.log(`💰 [SaleController] Total: ${total}`);
                console.log(`💰 [SaleController] Usando: ${walletAmount} de billetera`);
                console.log(`💳 [SaleController] Restante: ${remainingAmount}`);
                
                // 🔥 VALIDAR QUE EL USUARIO TENGA SALDO SUFICIENTE EN LA WALLET
                const wallet = await models.Wallet.findOne({ user: req.user._id });
                const currentBalance = wallet?.balance || 0;
                
                console.log(`💼 [SaleController] Saldo actual en wallet: ${currentBalance}`);
                console.log(`📋 [SaleController] Solicitado: ${walletAmount}`);
                
                if (currentBalance < walletAmount) {
                    console.error(`❌ [SaleController] Saldo insuficiente: disponible ${currentBalance}, solicitado ${walletAmount}`);
                    return res.status(400).send({ 
                        message: 'Saldo insuficiente en la billetera',
                        available: currentBalance,
                        requested: walletAmount
                    });
                }
                
                console.log('✅ [SaleController] Validación de saldo exitosa');
                
                // ✅ USAR FUNCIÓN DEL WALLETCONTROLLER
                try {
                    const productNames = Carts.map(c => c.product.title).join(', ');
                    const description = `Compra de ${Carts.length} producto(s): ${productNames.substring(0, 100)}`;
                    
                    // Llamar a la función de WalletController (pasará null como saleId por ahora)
                    const walletResult = await useWalletBalance(
                        req.user._id,
                        walletAmount,
                        null, // saleId - se actualizará después
                        description
                    );
                    
                    walletTransaction = walletResult.transaction;
                    console.log(`✅ [SaleController] Debitado ${walletAmount} de billetera. Nuevo saldo: ${walletResult.balance}`);
                } catch (walletError) {
                    console.error('❌ [SaleController] Error al debitar billetera:', walletError);
                    return res.status(500).send({
                        message: 'Error al procesar pago con billetera',
                        error: walletError.message
                    });
                }
            }

            // Crear detalle de la venta
            const saleDetail = Carts.map(cart => ({
                product: cart.product._id,
                product_type: cart.product_type,
                title: cart.product.title,
                price_unit: cart.price_unit,
                discount: cart.discount,
                type_discount: cart.type_discount,
            }));

            // Determinar estado de la venta y método de pago
            let saleStatus = 'Pendiente';
            let methodPayment = req.body.method_payment || 'wallet'; // Default 'wallet' si no hay otro método
            
            if (walletAmount >= total) {
                // Pago 100% con billetera
                saleStatus = 'Pagado';
                methodPayment = 'wallet'; // 🔥 Método de pago es billetera
                console.log('✅ [SaleController] Pago 100% con billetera - Marcando como Pagado');
            } else if (remainingAmount > 0 && req.body.method_payment) {
                // Pago mixto o solo con otro método
                methodPayment = req.body.method_payment;
                if (methodPayment !== 'transfer') {
                    // Métodos como PayPal, Stripe, etc. se confirman automáticamente
                    saleStatus = req.body.status || 'Pendiente';
                } else {
                    // Transferencia requiere confirmación manual
                    saleStatus = 'Pendiente';
                }
            }

            // Crear la venta
            const saleData = {
                ...req.body,
                user: req.user._id,
                detail: saleDetail,
                status: saleStatus,
                method_payment: methodPayment, // 🔥 Asegurar que method_payment esté definido
                // 🆕 Campos de billetera
                wallet_amount: walletAmount,
                remaining_amount: remainingAmount
            };
            
            const Sale = await models.Sale.create(saleData);
            console.log(`✅ [SaleController] Venta creada: ${Sale._id} - Status: ${Sale.status}`);

            // Actualizar metadata de la transacción de billetera con el ID de la venta
            if (walletTransaction) {
                // Buscar la billetera y actualizar la transacción
                const wallet = await models.Wallet.findOne({ user: req.user._id });
                if (wallet) {
                    const transaction = wallet.transactions.id(walletTransaction._id);
                    if (transaction && transaction.metadata) {
                        transaction.metadata.orderId = Sale._id;
                        await wallet.save();
                        console.log(`✅ [SaleController] Transacción de wallet actualizada con sale_id: ${Sale._id}`);
                    }
                }
            }

            // 💰 CREAR GANANCIAS DEL INSTRUCTOR (InstructorEarnings)
            if (Sale.status === 'Pagado') {
                await createInstructorEarnings(Sale);
                
                // 📚 INSCRIBIR AUTOMÁTICAMENTE EN CURSOS
                console.log('📚 [SaleController] Inscribiendo estudiante en cursos...');
                for (const item of Sale.detail) {
                    if (item.product_type === 'course') {
                        await enrollStudent(req.user._id, item.product);
                    }
                }
                console.log('✅ [SaleController] Estudiante inscrito en todos los cursos');
            }

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

            // 📧 Enviar email solo si está pagado
            if (Sale.status === 'Pagado') {
                try {
                    await send_email(Sale._id);
                    console.log('📧 Email de confirmación enviado');
                } catch (emailError) {
                    console.error('❌ Error al enviar email:', emailError);
                }
            }

            // Limpiar carrito
            await models.Cart.deleteMany({ user: req.user._id });
            console.log('🧹 Carrito limpiado');

            // Mensaje de respuesta según tipo de pago
            let responseMessage = '✅ Venta registrada exitosamente';
            
            if (walletAmount >= total) {
                responseMessage = '✅ ¡Compra completada con tu billetera! Ya puedes acceder a tu contenido.';
            } else if (walletAmount > 0) {
                responseMessage = `✅ Venta registrada. Usaste ${walletAmount.toFixed(2)} de tu billetera. Completa el pago de ${remainingAmount.toFixed(2)} para activar tu acceso.`;
            }

            res.status(200).send({
                message: responseMessage,
                sale: Sale,
                wallet_used: walletAmount,
                remaining_amount: remainingAmount,
                fully_paid: walletAmount >= total
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'OCURRIO UN PROBLEMA',
                error: error.message
            });
        }
    },

    // 🔧 ENDPOINT TEMPORAL: Procesar ventas existentes para crear ganancias
    process_existing_sales: async (req, res) => {
        try {
            console.log('🔧 Procesando ventas existentes...');

            // Buscar todas las ventas pagadas que no tengan ganancias creadas
            const sales = await models.Sale.find({ status: 'Pagado' });
            
            let processedCount = 0;
            let skippedCount = 0;

            for (const sale of sales) {
                // Verificar si ya existen ganancias para esta venta
                const existingEarnings = await models.InstructorEarnings.findOne({ sale: sale._id });
                
                if (existingEarnings) {
                    console.log(`⏩ Venta ${sale._id} ya tiene ganancias creadas, skip...`);
                    skippedCount++;
                    continue;
                }

                // Crear ganancias para esta venta
                await createInstructorEarnings(sale);
                processedCount++;
            }

            console.log(`✅ Proceso completado: ${processedCount} ventas procesadas, ${skippedCount} omitidas`);

            res.status(200).json({
                success: true,
                message: 'Ventas existentes procesadas correctamente',
                processed: processedCount,
                skipped: skippedCount,
                total: sales.length
            });
        } catch (error) {
            console.error('❌ Error al procesar ventas existentes:', error);
            res.status(500).json({
                success: false,
                message: 'Error al procesar ventas existentes',
                error: error.message
            });
        }
    },

    list: async (req, res) => {
        try {
            console.log('📋 [SaleController.list] Iniciando listado de ventas...');
            
            const { search, status, month, year, exclude_refunded } = req.query;
            const user = req.user;

            console.log(`   • Usuario: ${user.name} (${user.rol})`);
            console.log(`   • Filtros: search="${search}", status="${status}", month="${month}", year="${year}"`);

            let filter = { status: { $ne: 'Anulado' } };

            // 🔥 NUEVO: Filtro para excluir ventas reembolsadas
            if (exclude_refunded === 'true') {
                const refundedSales = await models.Refund.find({ 
                    status: 'completed',
                    state: 1 
                }).distinct('sale');
                
                if (refundedSales.length > 0) {
                    filter._id = { $nin: refundedSales };
                }
                console.log(`🚫 Excluyendo ${refundedSales.length} ventas reembolsadas`);
            }

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
            if (user.rol === 'instructor') {
                console.log('   🔍 Filtrando ventas del instructor...');
                
                // Encontrar cursos del instructor
                const instructorCourses = await models.Course.find({ user: user._id }).select('_id');
                const courseIds = instructorCourses.map(c => c._id);

                // Encontrar proyectos del instructor
                const instructorProjects = await models.Project.find({ user: user._id }).select('_id');
                const projectIds = instructorProjects.map(p => p._id);

                // Combinar ambos arrays
                const allProductIds = [...courseIds, ...projectIds];
                const allProductIdStrings = allProductIds.map(id => id.toString());

                console.log(`   • Productos del instructor: ${allProductIds.length}`);

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

                console.log(`   ✅ Encontradas ${sales.length} ventas del instructor`);

                // 🔥 NUEVO: Agregar información de reembolsos para instructor
                const saleIds = sales.map(s => s._id);
                const refunds = await models.Refund.find({ 
                    sale: { $in: saleIds },
                    state: 1 
                }).lean();

                const refundMap = new Map();
                refunds.forEach(r => {
                    refundMap.set(r.sale.toString(), r);
                });

                console.log(`   🔄 Reembolsos encontrados: ${refunds.length}`);

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
                        _id: sale._id.toString(), // Asegurar que el ID sea string
                        refund: refundMap.get(sale._id.toString()) || null // 🔥 AGREGAR REFUND
                    };
                });

                // Eliminar ventas que quedaron sin detalles (por si acaso)
                sales = sales.filter(sale => sale.detail.length > 0);

                // 📊 Estadísticas para logs
                const stats = {
                    total: sales.length,
                    withRefund: sales.filter(s => s.refund).length,
                    completed: sales.filter(s => s.refund?.status === 'completed').length
                };

                console.log(`   📊 Stats: Total=${stats.total}, Con reembolso=${stats.withRefund}, Completados=${stats.completed}`);
                console.log('✅ [SaleController.list] Ventas del instructor procesadas');

                return res.status(200).json({ sales });

            } else {
                // Admin ve todas las ventas sin filtrar
                console.log('   👑 Cargando todas las ventas (admin)...');
                
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
                    .sort({ createdAt: -1 })
                    .lean();

                console.log(`   ✅ Encontradas ${sales.length} ventas totales`);

                // 🔥 CRÍTICO: Cargar reembolsos asociados
                console.log('   🔄 Cargando información de reembolsos...');
                const saleIds = sales.map(s => s._id);
                const refunds = await models.Refund.find({ 
                    sale: { $in: saleIds },
                    state: 1 
                }).lean();

                console.log(`   ✅ Reembolsos encontrados: ${refunds.length}`);

                // 🔥 CRÍTICO: Mapear reembolsos a ventas
                const refundMap = new Map();
                refunds.forEach(r => {
                    refundMap.set(r.sale.toString(), r);
                });

                // 🔥 CRÍTICO: Agregar info de reembolso a cada venta
                const salesWithRefunds = sales.map(sale => ({
                    ...sale,
                    refund: refundMap.get(sale._id.toString()) || null
                }));

                // 📊 Calcular estadísticas
                const stats = {
                    total: salesWithRefunds.length,
                    refunded: salesWithRefunds.filter(s => s.refund?.status === 'completed').length,
                    active: salesWithRefunds.filter(s => !s.refund || s.refund.status !== 'completed').length,
                    pagado: salesWithRefunds.filter(s => s.status === 'Pagado' && (!s.refund || s.refund.status !== 'completed')).length,
                    pendiente: salesWithRefunds.filter(s => s.status === 'Pendiente').length
                };

                console.log('   📊 Estadísticas finales:');
                console.log(`      • Total ventas: ${stats.total}`);
                console.log(`      • Ventas activas: ${stats.active}`);
                console.log(`      • Ventas reembolsadas: ${stats.refunded}`);
                console.log(`      • Pagadas: ${stats.pagado}`);
                console.log(`      • Pendientes: ${stats.pendiente}`);
                console.log('✅ [SaleController.list] Proceso completado exitosamente');

                return res.status(200).json({ 
                    sales: salesWithRefunds,
                    stats: stats 
                });
            }

        } catch (error) {
            console.error("❌ Error en SaleController.list:", error);
            console.error('Stack:', error.stack);
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
 * 💰 Crear registros de ganancias para el instructor cuando se completa una venta
 * @param {Object} sale - Venta completa con todos los detalles
 */
async function createInstructorEarnings(sale) {
    try {
        console.log(`💰 Creando ganancias para venta ${sale._id}...`);

        // Obtener configuración de comisiones
        const commissionSettings = await models.PlatformCommissionSettings.findOne();
        const defaultCommissionRate = commissionSettings?.default_commission_rate || 30;
        const daysUntilAvailable = commissionSettings?.days_until_available || 0;

        // Calcular fecha de disponibilidad
        const availableAt = new Date();
        availableAt.setDate(availableAt.getDate() + daysUntilAvailable);

        // Procesar cada producto de la venta
        for (const item of sale.detail) {
            let instructorId = null;
            let productModel = null;

            // Obtener el instructor según el tipo de producto
            if (item.product_type === 'course') {
                const course = await models.Course.findById(item.product).select('user');
                if (course && course.user) {
                    instructorId = course.user;
                    productModel = 'course';
                }
            } else if (item.product_type === 'project') {
                const project = await models.Project.findById(item.product).select('user');
                if (project && project.user) {
                    instructorId = project.user;
                    productModel = 'project';
                }
            }

            // Si no hay instructor, skip (puede ser un producto de la plataforma)
            if (!instructorId) {
                console.log(`⚠️  Producto ${item.product} no tiene instructor asignado`);
                continue;
            }

            // Verificar si el instructor tiene comisión personalizada
            let commissionRate = defaultCommissionRate;
            const customRate = commissionSettings?.instructor_custom_rates?.find(
                rate => rate.instructor.toString() === instructorId.toString()
            );
            if (customRate) {
                commissionRate = customRate.commission_rate;
            }

            // Calcular montos
            const salePrice = item.price_unit; // Precio después de descuento
            const platformCommissionAmount = (salePrice * commissionRate) / 100;
            const instructorEarning = salePrice - platformCommissionAmount;

            // Crear registro de ganancia
            const earningData = {
                instructor: instructorId,
                sale: sale._id,
                product_id: item.product,
                product_type: item.product_type,
                
                // Montos
                sale_price: salePrice,
                currency: sale.currency_total || 'USD',
                platform_commission_rate: commissionRate,
                platform_commission_amount: platformCommissionAmount,
                instructor_earning: instructorEarning,
                instructor_earning_usd: instructorEarning, // Por ahora USD = USD
                
                // Estado y fechas
                status: daysUntilAvailable === 0 ? 'available' : 'pending',
                earned_at: new Date(),
                available_at: availableAt,
            };

            // Guardar en base de datos
            await models.InstructorEarnings.create(earningData);
            console.log(`✅ Ganancia creada: ${instructorEarning.toFixed(2)} ${sale.currency_total || 'USD'} para instructor ${instructorId}`);
        }

        console.log(`✅ Todas las ganancias fueron creadas para la venta ${sale._id}`);
    } catch (error) {
        console.error(`❌ Error al crear ganancias para venta ${sale._id}:`, error);
        // No lanzar error para no bloquear el flujo de la venta
    }
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
