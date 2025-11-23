import models from "../models/index.js";
import { emitNewSaleToAdmins, emitSaleStatusUpdate } from '../services/socket.service.js';
import { notifyNewSale } from '../services/telegram.service.js';
import { useWalletBalance } from './WalletController.js';

import fs from 'fs';
import ejs from 'ejs';
import nodemailer from 'nodemailer';
import smtpTransport from 'nodemailer-smtp-transport';

/**
 * 📧 Enviar email de confirmación de compra
 */
async function sendConfirmationEmail(sale_id) {
    try {
        const sale = await models.Sale.findById(sale_id).populate("user");
        if (!sale) {
            console.error("❌ Venta no encontrada para enviar email");
            return;
        }

        const transporter = nodemailer.createTransport(smtpTransport({
            service: 'gmail',
            host: 'smtp.gmail.com',
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASSWORD
            }
        }));

        const html = await fs.promises.readFile(process.cwd() + '/mails/email_sale.html', 'utf-8');

        const mappedDetail = sale.detail.map((detail) => {
            const imagePath = detail.product?.imagen || 'default.jpg';
            const imageType = detail.product_type === 'course' ? 'courses/imagen-course' : 'projects/imagen-project';
            
            return {
                ...detail.toObject(),
                portada: `${process.env.URL_BACKEND}/api/${imageType}/${imagePath}`
            };
        });

        const htmlToSend = ejs.render(html, { Orden: sale, Orden_detail: mappedDetail });

        await transporter.sendMail({
            from: process.env.MAIL_USER,
            to: sale.user.email,
            subject: 'Confirmación de tu compra ' + sale._id,
            html: htmlToSend
        });

        console.log('📧 Email de confirmación enviado a:', sale.user.email);
    } catch (error) {
        console.error("❌ Error al enviar email:", error.message);
    }
}

/**
 * 📚 Inscribir estudiante en un curso
 */
async function enrollStudent(userId, courseId) {
    try {
        const existing = await models.CourseStudent.findOne({ user: userId, course: courseId });
        if (!existing) {
            await models.CourseStudent.create({ user: userId, course: courseId });
            console.log(`   ✅ Inscripción en curso creada: usuario ${userId} en curso ${courseId}`);
        } else {
            console.log(`   ℹ️  Usuario ya inscrito en curso ${courseId}`);
        }
    } catch (error) {
        console.error(`   ❌ Error al inscribir estudiante en curso:`, error.message);
    }
}

/**
 * 💰 Crear ganancias del instructor para un producto
 */
async function createEarningForProduct(sale, item) {
    try {
        // Obtener instructor del producto
        let instructorId = null;
        
        if (item.product_type === 'course') {
            const course = await models.Course.findById(item.product).select('user');
            instructorId = course?.user;
        } else if (item.product_type === 'project') {
            const project = await models.Project.findById(item.product).select('user');
            instructorId = project?.user;
        }

        if (!instructorId) {
            console.log(`   ⚠️  Producto ${item.product} sin instructor`);
            return;
        }

        // Verificar si ya existe
        const existing = await models.InstructorEarnings.findOne({
            sale: sale._id,
            product_id: item.product
        });

        if (existing) {
            console.log(`   ℹ️  Ganancia ya existe para producto ${item.product}`);
            return;
        }

        // Obtener configuración de comisiones
        const settings = await models.PlatformCommissionSettings.findOne();
        const defaultRate = settings?.default_commission_rate || 30;
        const daysUntilAvailable = settings?.days_until_available || 0;

        // Verificar comisión personalizada
        let commissionRate = defaultRate;
        const customRate = settings?.instructor_custom_rates?.find(
            r => r.instructor.toString() === instructorId.toString()
        );
        if (customRate) commissionRate = customRate.commission_rate;

        // Calcular montos
        const salePrice = item.price_unit || 0;
        const platformCommission = (salePrice * commissionRate) / 100;
        const instructorEarning = salePrice - platformCommission;

        // Calcular fecha disponible
        const availableAt = new Date();
        availableAt.setDate(availableAt.getDate() + daysUntilAvailable);

        await models.InstructorEarnings.create({
            instructor: instructorId,
            sale: sale._id,
            product_id: item.product,
            product_type: item.product_type,
            sale_price: salePrice,
            currency: sale.currency_total || 'USD',
            platform_commission_rate: commissionRate,
            platform_commission_amount: platformCommission,
            instructor_earning: instructorEarning,
            instructor_earning_usd: instructorEarning,
            status: daysUntilAvailable === 0 ? 'available' : 'pending',
            earned_at: new Date(),
            available_at: availableAt
        });

        console.log(`   ✅ Ganancia creada: $${instructorEarning.toFixed(2)} para instructor ${instructorId}`);
    } catch (error) {
        console.error(`   ❌ Error al crear ganancia:`, error.message);
    }
}

/**
 * 🎯 Procesar venta pagada - Inscripciones y ganancias
 * 🔥 IMPORTANTE: Los proyectos NO requieren inscripción - el acceso se verifica por venta pagada
 */
async function processPaidSale(sale, userId) {
    console.log(`\n🎯 [processPaidSale] Procesando venta ${sale._id}...`);
    console.log(`   👤 Usuario: ${userId}`);
    console.log(`   📦 Total items: ${sale.detail.length}`);
    
    for (const item of sale.detail) {
        console.log(`\n   ─────────────────────────────────`);
        console.log(`   📦 Item: ${item.title}`);
        console.log(`   🏷️  Tipo: ${item.product_type}`);
        console.log(`   🆔 Product ID: ${item.product}`);
        console.log(`   💰 Precio: ${item.price_unit}`);
        
        // 📚 Inscribir en CURSOS (tiene modelo CourseStudent)
        if (item.product_type === 'course') {
            console.log(`   📚 Inscribiendo en curso...`);
            await enrollStudent(userId, item.product);
        }
        // 📦 PROYECTOS: No requieren inscripción (se verifica por venta pagada)
        else if (item.product_type === 'project') {
            console.log(`   📦 Proyecto: acceso otorgado automáticamente (sin modelo de inscripción)`);
            console.log(`   ✅ Acceso verificado mediante: Sale.status='Pagado' + detail.product_type='project'`);
        }
        
        // 💰 Crear ganancias del instructor (para cursos Y proyectos)
        console.log(`   💰 Creando ganancia para instructor...`);
        await createEarningForProduct(sale, item);
    }
    
    console.log(`\n✅ [processPaidSale] Venta ${sale._id} procesada completamente`);
    console.log(`✅ Acceso activado para ${sale.detail.length} producto(s)\n`);
}

export default {
    /**
     * 🛍️ REGISTRO DE VENTA - Sistema de compra directa (un producto a la vez)
     * 
     * CARACTERÍSTICAS:
     * - Acepta compra 1x1 de curso o proyecto
     * - Soporta pago 100% billetera (activa automáticamente)
     * - Soporta pago mixto (billetera + transferencia)
     * - Soporta pago 100% transferencia (requiere aprobación admin)
     */
    register: async (req, res) => {
        try {
            console.log('\n🛍️ ═══════════════════════════════════════════════');
            console.log('🛍️ [SaleController] NUEVA VENTA - COMPRA DIRECTA');
            console.log('🛍️ ═══════════════════════════════════════════════');
            
            const { detail, total, use_wallet, wallet_amount, method_payment } = req.body;
            const userId = req.user._id;

            // ════════════════════════════════════════════════
            // 1️⃣ VALIDAR QUE HAY PRODUCTO
            // ════════════════════════════════════════════════
            if (!detail || !Array.isArray(detail) || detail.length === 0) {
                return res.status(400).json({ message: 'Debes enviar al menos un producto' });
            }

            const item = detail[0]; // Sistema de compra directa = 1 producto
            console.log(`📦 Producto: ${item.title} (${item.product_type}) - $${item.price_unit}`);

            // ════════════════════════════════════════════════
            // 2️⃣ VALIDAR QUE EL PRODUCTO EXISTE
            // ════════════════════════════════════════════════
            let product = null;
            if (item.product_type === 'course') {
                product = await models.Course.findById(item.product);
            } else if (item.product_type === 'project') {
                product = await models.Project.findById(item.product);
            }

            if (!product) {
                return res.status(404).json({ message: 'Producto no encontrado' });
            }

            // ════════════════════════════════════════════════
            // 3️⃣ VALIDAR TOTAL
            // ════════════════════════════════════════════════
            const expectedTotal = parseFloat(item.price_unit) || 0;
            const receivedTotal = parseFloat(total) || 0;
            
            if (Math.abs(expectedTotal - receivedTotal) > 0.01) {
                console.error(`❌ Total no coincide: esperado=${expectedTotal}, recibido=${receivedTotal}`);
                return res.status(400).json({ 
                    message: 'El total no coincide con el precio del producto',
                    expected: expectedTotal,
                    received: receivedTotal
                });
            }

            // ════════════════════════════════════════════════
            // 4️⃣ PROCESAR BILLETERA (si aplica)
            // ════════════════════════════════════════════════
            let walletUsed = 0;
            let remainingToPay = receivedTotal;
            let walletTransaction = null;

            if (use_wallet && wallet_amount > 0) {
                walletUsed = parseFloat(wallet_amount);
                
                // Validar saldo
                const wallet = await models.Wallet.findOne({ user: userId });
                const balance = wallet?.balance || 0;

                console.log(`💰 Billetera: saldo=$${balance}, solicitado=$${walletUsed}`);

                if (balance < walletUsed) {
                    return res.status(400).json({
                        message: 'Saldo insuficiente en billetera',
                        available: balance,
                        requested: walletUsed
                    });
                }

                // Debitar billetera
                try {
                    const result = await useWalletBalance(
                        userId,
                        walletUsed,
                        null,
                        `Compra: ${item.title}`
                    );
                    walletTransaction = result.transaction;
                    console.log(`✅ Debitado $${walletUsed} de billetera. Nuevo saldo: $${result.newBalance}`);
                } catch (walletError) {
                    console.error('❌ Error al debitar billetera:', walletError);
                    return res.status(500).json({ message: 'Error al procesar pago con billetera' });
                }

                remainingToPay = receivedTotal - walletUsed;
            }

            // ════════════════════════════════════════════════
            // 5️⃣ DETERMINAR ESTADO DE LA VENTA
            // ════════════════════════════════════════════════
            let status = 'Pendiente';
            let finalMethod = method_payment || 'other';

            // 🔥 PAGO 100% CON BILLETERA → APROBADO AUTOMÁTICAMENTE
            if (walletUsed >= receivedTotal) {
                status = 'Pagado';
                finalMethod = 'wallet';
                console.log('✅ Pago 100% con billetera → Estado: Pagado (APROBACIÓN AUTOMÁTICA)');
            } 
            // 🔥 PAGO MIXTO o 100% TRANSFERENCIA → REQUIERE APROBACIÓN
            else if (remainingToPay > 0.01) {
                if (!method_payment) {
                    // Revertir billetera si no hay método de pago
                    if (walletTransaction) {
                        const wallet = await models.Wallet.findOne({ user: userId });
                        wallet.balance += walletUsed;
                        wallet.transactions.pull(walletTransaction._id);
                        await wallet.save();
                        console.log('↩️ Billetera revertida - falta método de pago');
                    }
                    return res.status(400).json({ message: 'Selecciona un método de pago para el saldo restante' });
                }
                status = 'Pendiente'; // Requiere aprobación del admin
                console.log(`⏳ Pago pendiente: $${remainingToPay.toFixed(2)} por ${method_payment}`);
            }

            // ════════════════════════════════════════════════
            // 6️⃣ CREAR LA VENTA
            // ════════════════════════════════════════════════
            const saleData = {
                user: userId,
                method_payment: finalMethod,
                currency_total: 'USD',
                currency_payment: 'USD',
                status: status,
                total: receivedTotal,
                detail: [{
                    product: item.product,
                    product_type: item.product_type,
                    title: item.title,
                    price_unit: item.price_unit,
                    discount: item.discount || 0,
                    type_discount: item.type_discount || 0
                }],
                price_dolar: req.body.price_dolar || 1,
                n_transaccion: req.body.n_transaccion,
                wallet_amount: walletUsed,
                remaining_amount: remainingToPay,
                auto_verified: walletUsed >= receivedTotal
            };

            const sale = await models.Sale.create(saleData);
            console.log(`✅ Venta creada: ${sale._id} - Status: ${sale.status}`);
            console.log(`💰 Wallet usado: $${walletUsed} | Restante: $${remainingToPay}`);

            // Actualizar transacción de billetera con ID de venta
            if (walletTransaction) {
                const wallet = await models.Wallet.findOne({ user: userId });
                const tx = wallet.transactions.id(walletTransaction._id);
                if (tx?.metadata) {
                    tx.metadata.orderId = sale._id;
                    await wallet.save();
                }
            }

            // ════════════════════════════════════════════════
            // 7️⃣ SI ESTÁ PAGADO 100% (BILLETERA), ACTIVAR ACCESO
            // ════════════════════════════════════════════════
            if (sale.status === 'Pagado') {
                console.log('🚀 [ACTIVACIÓN AUTOMÁTICA] Procesando inscripciones y ganancias...');
                await processPaidSale(sale, userId);
                
                // Enviar email
                sendConfirmationEmail(sale._id).catch(err => 
                    console.error('⚠️ Error enviando email:', err.message)
                );
            }

            // ════════════════════════════════════════════════
            // 8️⃣ NOTIFICACIONES
            // ════════════════════════════════════════════════
            const saleWithUser = await models.Sale.findById(sale._id).populate('user', 'name surname email');
            emitNewSaleToAdmins(saleWithUser);
            
            notifyNewSale(saleWithUser).catch(err => 
                console.error('⚠️ Error en notificación Telegram:', err.message)
            );

            // ════════════════════════════════════════════════
            // 9️⃣ RESPUESTA
            // ════════════════════════════════════════════════
            let message = '';
            
            if (walletUsed >= receivedTotal) {
                message = '✅ ¡Compra completada con billetera! Ya puedes acceder a tu contenido.';
            } else {
                message = `✅ Venta registrada. Completa el pago de $${remainingToPay.toFixed(2)} para activar tu acceso.`;
            }

            console.log('🛍️ ═══════════════════════════════════════════════\n');

            res.status(200).json({
                message,
                sale,
                wallet_used: walletUsed,
                remaining_amount: remainingToPay,
                fully_paid: walletUsed >= receivedTotal,
                auto_activated: walletUsed >= receivedTotal // 🔥 NUEVO: Indica si se activó automáticamente
            });

        } catch (error) {
            console.error('❌ [SaleController.register] Error:', error);
            res.status(500).json({ message: 'Error al procesar la venta', error: error.message });
        }
    },

    /**
     * 📋 LISTAR VENTAS
     */
    list: async (req, res) => {
        try {
            const { search, status, month, year, exclude_refunded } = req.query;
            const user = req.user;

            let filter = { status: { $ne: 'Anulado' } };

            // Filtro para excluir ventas reembolsadas
            if (exclude_refunded === 'true') {
                const refundedSales = await models.Refund.find({ 
                    status: 'completed', state: 1 
                }).distinct('sale');
                
                if (refundedSales.length > 0) {
                    filter._id = { $nin: refundedSales };
                }
            }

            if (status) filter.status = status;

            // Filtro por fecha
            if (month && year) {
                const startDate = new Date(year, month - 1, 1);
                const endDate = new Date(year, month, 0, 23, 59, 59, 999);
                filter.createdAt = { $gte: startDate, $lte: endDate };
            } else if (year) {
                const startDate = new Date(year, 0, 1);
                const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
                filter.createdAt = { $gte: startDate, $lte: endDate };
            }

            // Búsqueda
            if (search) {
                const users = await models.User.find({
                    $or: [
                        { name: new RegExp(search, "i") },
                        { surname: new RegExp(search, "i") },
                        { email: new RegExp(search, "i") }
                    ]
                }).select('_id');
                
                filter.$or = [
                    { n_transaccion: new RegExp(search, "i") },
                    { user: { $in: users.map(u => u._id) } }
                ];
            }

            // Filtro para instructores
            if (user.rol === 'instructor') {
                const courses = await models.Course.find({ user: user._id }).select('_id');
                const projects = await models.Project.find({ user: user._id }).select('_id');
                const productIds = [...courses, ...projects].map(p => p._id);

                filter['detail'] = { $elemMatch: { product: { $in: productIds } } };
            }

            // Obtener ventas
            let sales = await models.Sale.find(filter)
                .populate('user', 'name surname email')
                .populate({ path: 'detail.product', select: 'title imagen user' })
                .sort({ createdAt: -1 })
                .lean();

            // Agregar info de reembolsos
            const saleIds = sales.map(s => s._id);
            const refunds = await models.Refund.find({ sale: { $in: saleIds }, state: 1 }).lean();
            const refundMap = new Map(refunds.map(r => [r.sale.toString(), r]));

            sales = sales.map(sale => ({
                ...sale,
                refund: refundMap.get(sale._id.toString()) || null
            }));

            // Filtrar para instructores
            if (user.rol === 'instructor') {
                const productIdStrings = [...await models.Course.find({ user: user._id }).select('_id'),
                                          ...await models.Project.find({ user: user._id }).select('_id')]
                                          .map(p => p._id.toString());

                sales = sales.map(sale => ({
                    ...sale,
                    detail: sale.detail.filter(item => 
                        item.product && productIdStrings.includes(item.product._id.toString())
                    )
                })).filter(sale => sale.detail.length > 0);
            }

            res.status(200).json({ sales });

        } catch (error) {
            console.error("❌ Error en list:", error);
            res.status(500).json({ message: "Error al obtener ventas" });
        }
    },

    /**
     * 🔄 ACTUALIZAR ESTADO DE VENTA (Solo Admin)
     * 
     * 🔥 IMPORTANTE: Cuando cambia de Pendiente → Pagado, activa automáticamente el acceso
     */
    update_status_sale: async (req, res) => {
        try {
            if (req.user.rol !== 'admin') {
                return res.status(403).json({ message: 'No autorizado' });
            }

            const { id } = req.params;
            const { status } = req.body;

            const sale = await models.Sale.findById(id).populate('user');
            if (!sale) {
                return res.status(404).json({ message: 'Venta no encontrada' });
            }

            const oldStatus = sale.status;
            sale.status = status;
            await sale.save();

            emitSaleStatusUpdate(sale);

            // 🔥 SI CAMBIA A PAGADO, ACTIVAR ACCESO AUTOMÁTICAMENTE
            if (oldStatus !== 'Pagado' && status === 'Pagado') {
                console.log('🚀 [ADMIN APROBÓ] Activando acceso para venta:', sale._id);
                await processPaidSale(sale, sale.user._id);
                sendConfirmationEmail(sale._id).catch(console.error);
            }

            res.status(200).json({ message: 'Estado actualizado', sale });

        } catch (error) {
            console.error('❌ Error en update_status_sale:', error);
            res.status(500).json({ message: 'Error al actualizar estado' });
        }
    },

    /**
     * 📄 MIS TRANSACCIONES (Estudiante)
     */
    my_transactions: async (req, res) => {
        try {
            const sales = await models.Sale.find({ user: req.user._id })
                .populate({ path: 'detail.product', select: 'title imagen' })
                .sort({ createdAt: -1 })
                .lean();

            const transactions = sales.map(sale => ({
                _id: sale._id,
                n_transaccion: sale.n_transaccion,
                method_payment: sale.method_payment,
                status: sale.status,
                total: sale.total,
                currency_total: sale.currency_total,
                createdAt: sale.createdAt,
                wallet_amount: sale.wallet_amount || 0,
                remaining_amount: sale.remaining_amount || 0,
                items: sale.detail.map(item => ({
                    product_id: item.product?._id,
                    product_type: item.product_type,
                    title: item.title || item.product?.title,
                    imagen: item.product?.imagen,
                    price_unit: item.price_unit
                }))
            }));

            res.status(200).json({ transactions });

        } catch (error) {
            console.error('❌ Error en my_transactions:', error);
            res.status(500).json({ message: 'Error al obtener transacciones' });
        }
    },

    /**
     * 🔍 BUSCAR POR NÚMERO DE TRANSACCIÓN
     */
    get_by_transaction: async (req, res) => {
        try {
            const { n_transaccion } = req.params;

            const sale = await models.Sale.findOne({ 
                n_transaccion, 
                user: req.user._id 
            })
            .populate({ path: 'detail.product', select: 'title imagen' })
            .lean();

            if (!sale) {
                return res.status(404).json({ message: 'Transacción no encontrada' });
            }

            res.status(200).json({ transaction: sale });

        } catch (error) {
            console.error('❌ Error en get_by_transaction:', error);
            res.status(500).json({ message: 'Error al buscar transacción' });
        }
    },

    /**
     * 🔔 NOTIFICACIONES RECIENTES (Admin)
     */
    recent_notifications: async (req, res) => {
        try {
            const { limit = 10 } = req.query;

            const sales = await models.Sale.find({})
                .populate('user', 'name surname email')
                .sort({ createdAt: -1 })
                .limit(parseInt(limit))
                .lean();

            const unreadCount = sales.filter(s => s.status === 'Pendiente').length;

            res.status(200).json({
                recent_sales: sales.map(s => ({
                    _id: s._id,
                    n_transaccion: s.n_transaccion,
                    total: s.total,
                    status: s.status,
                    createdAt: s.createdAt,
                    user: s.user
                })),
                unread_count: unreadCount
            });

        } catch (error) {
            console.error('❌ Error en recent_notifications:', error);
            res.status(500).json({ message: 'Error al cargar notificaciones' });
        }
    },

    /**
     * ✅ MARCAR NOTIFICACIONES COMO LEÍDAS
     */
    mark_notifications_read: async (req, res) => {
        res.status(200).json({ success: true });
    }
};
