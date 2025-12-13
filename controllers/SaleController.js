import models from "../models/index.js";
import axios from 'axios'; // 🔥 IMPORTAR AXIOS
import { emitNewSaleToAdmins, emitSaleStatusUpdate } from '../services/socket.service.js';
import { notifyNewSale, notifyPaymentApproved } from '../services/telegram.service.js';
import { processPaidSale, createEarningForProduct } from '../services/SaleService.js'; // 🔥 IMPORTAR SERVICIO
import { useWalletBalance } from './WalletController.js';
import { formatCurrency } from '../services/exchangeRate.service.js'; // 🔥 CONVERSIÓN MULTI-PAÍS

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// 🛡️ SECURITY: Input Sanitization
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * 📧 Enviar email de confirmación de compra
 */
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
    async register(req, res) {
        try {

            // 🛡️ SANITIZE INPUTS
            if (req.body.method_payment) req.body.method_payment = DOMPurify.sanitize(req.body.method_payment);
            if (req.body.currency_payment) req.body.currency_payment = DOMPurify.sanitize(req.body.currency_payment);
            if (req.body.n_transaccion) req.body.n_transaccion = DOMPurify.sanitize(req.body.n_transaccion);
            if (req.body.country) req.body.country = DOMPurify.sanitize(req.body.country);

            let { method_payment, currency_payment, n_transaccion, detail, country } = req.body; // 🔥 detail en lugar de items + country
            const user_id = req.user._id;
            const userCountry = country || 'MX'; // Default México

            // 🔥 Generar n_transaccion si no existe (para usarlo en billetera y preferencia)
            if (!n_transaccion) {
                n_transaccion = `TXN-${Date.now()}`;
            }

            console.log('🛒 [register] Iniciando proceso de pago...', {
                method_payment,
                user_id,
                items_count: detail?.length
            });

            // 🔥 CORRECCIÓN CRÍTICA 3: Prevenir pagos duplicados
            const recentPending = await models.Sale.findOne({
                user: user_id,
                status: 'Pendiente',

                createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
            });

            if (recentPending) {
                console.log('⚠️ [register] Pago duplicado detectado:', recentPending._id);
                return res.status(409).send({
                    message: 'Ya tienes un pago en proceso. Por favor espera.',
                    pending_sale: recentPending._id,
                    n_transaccion: recentPending.n_transaccion,
                    method_payment: recentPending.method_payment,
                    remaining_amount: recentPending.remaining_amount || recentPending.total,
                    created_at: recentPending.createdAt
                });
            }

            // Calcular total
            let total = 0;
            const sale_details = [];

            // 🔥 Adaptar 'detail' (frontend) a 'items' (lógica del usuario)
            const items = detail || [];

            // 🔥 CORRECCIÓN CRÍTICA 2: Validar productos ANTES de cobrar
            for (const item of items) {
                if (item.product_type === 'course') {
                    const course = await models.Course.findById(item.product);
                    if (!course) {
                        return res.status(404).send({
                            message: `El curso "${item.title}" no existe`
                        });
                    }
                    if (course.state !== 2) {
                        return res.status(400).send({
                            message: `El curso "${item.title}" no está disponible`
                        });
                    }
                } else if (item.product_type === 'project') {
                    const project = await models.Project.findById(item.product);
                    if (!project) {
                        return res.status(404).send({
                            message: `El proyecto "${item.title}" no existe`
                        });
                    }
                    if (project.state !== 2) {
                        return res.status(400).send({
                            message: `El proyecto "${item.title}" no está disponible`
                        });
                    }
                }
            }

            for (const item of items) {
                const detailObj = {
                    product: item.product, // 🔥 CORREGIDO: usar 'product' directamente
                    product_type: item.product_type || item.type_detail, // 🔥 FIX: Fallback to type_detail
                    title: item.title,
                    price_unit: item.price_unit,
                    discount: item.discount || 0,
                    type_discount: item.type_discount || 0,
                    campaign_discount: item.campaign_discount || null
                };

                sale_details.push(detailObj);
                total += item.price_unit;
            }

            console.log('💰 [register] Total calculado:', total);

            // 🔥 LÓGICA PARA PAGO 100% CON BILLETERA
            if (method_payment === 'wallet') {
                console.log('💰 [register] Método seleccionado: wallet (100% billetera)');

                // 1. Validar Billetera
                const wallet = await models.Wallet.findOne({ user: user_id });
                if (!wallet) {
                    return res.status(400).send({ message: 'Billetera no encontrada' });
                }

                if (wallet.balance < total) {
                    return res.status(400).send({
                        message: 'Saldo insuficiente en billetera',
                        available: wallet.balance,
                        required: total
                    });
                }

                // 2. Descontar saldo
                const newBalance = wallet.balance - total;
                wallet.balance = newBalance;
                wallet.transactions.push({
                    user: user_id,
                    type: 'debit',
                    amount: total,
                    balanceAfter: newBalance,
                    description: `Pago compra - ${n_transaccion}`,
                    date: new Date(),
                    metadata: {
                        orderId: n_transaccion,
                        payment_method: 'wallet',
                        status: 'completed'
                    }
                });
                await wallet.save();
                console.log(`✅ [register] Billetera descontada: ${total}. Nuevo saldo: ${newBalance}`);

                // 3. Crear Venta PAGADA
                const sale = await models.Sale.create({
                    user: user_id,
                    method_payment: 'wallet',
                    currency_payment: currency_payment,
                    n_transaccion: n_transaccion,
                    detail: sale_details,
                    // price_dolar: total, // REMOVED
                    total: total,
                    status: 'Pagado', // 🔥 IMPORTANTE: Estado Pagado
                    wallet_amount: total,
                    remaining_amount: 0
                });

                // 4. Procesar accesos y notificaciones
                await processPaidSale(sale, user_id);
                
                // 🔥 CORRECCIÓN: Populatar usuario para Telegram
                const saleWithUser = await models.Sale.findById(sale._id).populate('user', 'name surname email').lean();
                notifyPaymentApproved(saleWithUser || sale).catch(console.error);

                return res.status(200).send({
                    message: 'Compra realizada con éxito',
                    sale: sale,
                    wallet_used: total,
                    fully_paid: true
                });
            }


            // 🔥 LÓGICA PAYPAL
            if (method_payment === 'paypal') {
                console.log('🅿️ [register] Método seleccionado: paypal');

                const { use_wallet, wallet_amount, remaining_amount } = req.body;
                const finalRemainingAmount = remaining_amount || total;

                // Crear venta en estado Pendiente
                const sale = await models.Sale.create({
                    user: user_id,
                    method_payment: 'paypal', // O 'mixed_paypal' si implementamos mixto futuro
                    currency_payment: 'MXN',
                    n_transaccion: n_transaccion || `TXN-${Date.now()}`,
                    detail: sale_details,
                    total: total,
                    status: 'Pendiente', // Se espera captura de PayPal
                    wallet_amount: use_wallet ? wallet_amount : 0,
                    remaining_amount: finalRemainingAmount
                });

                // Si hay pago mixto con wallet, aquí se debería descontar la wallet (similar a lo que se hacía con MP)
                // Por simplicidad en este refactor, asumimos que el frontend maneja la redirección a PayPal
                // y luego se notifica.

                // NOTA: Para un soporte completo de PayPal Mixto, se debería implementar la lógica de descuento de Wallet aquí.
                // Como el usuario pidió "Full PayPal", habilitamos el registro básico.

                return res.status(200).send({
                    message: 'Venta iniciada (PayPal).',
                    sale: sale,
                    n_transaccion: n_transaccion
                });
            }

            // 🔥 SI LLEGA AQUÍ, ES UN MÉTODO NO SOPORTADO
            return res.status(400).send({
                message: 'Método de pago no válido o no soportado.',
                valid_methods: ['wallet', 'paypal']
            });

        } catch (error) {
            console.error('❌ [register] Error general:', error);
            return res.status(500).send({
                message: 'Error al procesar el pago',
                error: error.message
            });
        }
    },

    /**
     * Crear una orden PayPal on-server para un sale existente
     * POST /api/checkout/paypal/create
     * Body: { n_transaccion }
     */
    createPaypalOrder: async (req, res) => {
        try {
            const { n_transaccion } = req.body;
            if (!n_transaccion) return res.status(400).send({ message: 'n_transaccion es requerido' });

            const sale = await models.Sale.findOne({ n_transaccion }).lean();
            if (!sale) return res.status(404).send({ message: 'Venta no encontrada' });
            if (sale.status !== 'Pendiente') return res.status(400).send({ message: 'Venta no en estado Pendiente' });

            // Calcular monto a cobrar por PayPal: remaining_amount o total
            const amount = sale.remaining_amount && sale.remaining_amount > 0 ? sale.remaining_amount : sale.total;

            const PAYPAL_API = process.env.PAYPAL_MODE === 'sandbox' ? 'https://api.sandbox.paypal.com' : 'https://api.paypal.com';

            // Obtener token de acceso PayPal
            const tokenR = await axios({
                method: 'post',
                url: `${PAYPAL_API}/v1/oauth2/token`,
                auth: {
                    username: process.env.PAYPAL_CLIENT_ID.trim(),
                    password: process.env.PAYPAL_CLIENT_SECRET.trim()
                },
                params: { grant_type: 'client_credentials' }
            });

            const accessToken = tokenR.data.access_token;

            // Crear orden
            const createR = await axios({
                method: 'post',
                url: `${PAYPAL_API}/v2/checkout/orders`,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                data: {
                    intent: 'CAPTURE',
                    purchase_units: [
                        {
                            amount: {
                                currency_code: 'MXN',
                                value: Number(amount).toFixed(2)
                            },
                            description: `Compra ${sale.n_transaccion}`
                        }
                    ],
                    application_context: {
                        brand_name: process.env.SITE_NAME || 'Dev-Sharks',
                        landing_page: 'NO_PREFERENCE',
                        user_action: 'PAY_NOW',
                        return_url: process.env.URL_FRONTEND_NGROK || process.env.URL_FRONTEND || 'https://localhost:4200',
                        cancel_url: process.env.URL_FRONTEND_NGROK || process.env.URL_FRONTEND || 'https://localhost:4200'
                    }
                }
            });

            const order = createR.data;
            return res.status(200).send({ success: true, orderId: order.id, links: order.links });
        } catch (error) {
            console.error('❌ [createPaypalOrder] Error:', error.response?.data || error.message || error);
            return res.status(500).send({ message: 'Error creating PayPal order', details: error.response?.data || error.message });
        }
    },

    /**
     * Capturar una orden PayPal y completar la venta
     * POST /api/checkout/paypal/capture
     * Body: { n_transaccion, orderId }
     */
    capturePaypalOrder: async (req, res) => {
        try {
            const { n_transaccion, orderId } = req.body;
            if (!n_transaccion || !orderId) return res.status(400).send({ message: 'n_transaccion y orderId son requeridos' });

            const sale = await models.Sale.findOne({ n_transaccion });
            if (!sale) return res.status(404).send({ message: 'Venta no encontrada' });
            if (sale.status === 'Pagado') return res.status(400).send({ message: 'Venta ya pagada' });

            const PAYPAL_API = process.env.PAYPAL_MODE === 'sandbox' ? 'https://api.sandbox.paypal.com' : 'https://api.paypal.com';

            // Obtener token de acceso PayPal
            const tokenR = await axios({
                method: 'post',
                url: `${PAYPAL_API}/v1/oauth2/token`,
                auth: {
                    username: process.env.PAYPAL_CLIENT_ID.trim(),
                    password: process.env.PAYPAL_CLIENT_SECRET.trim()
                },
                params: { grant_type: 'client_credentials' }
            });
            const accessToken = tokenR.data.access_token;

            // Capturar orden
            const captureR = await axios({
                method: 'post',
                url: `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                data: {} // 🔥 PayPal requiere un body vacío como mínimo
            });

            const captureData = captureR.data;
            // Comprobar estado
            const status = captureData.status;

            if (status !== 'COMPLETED') {
                console.warn('⚠️ [capturePaypalOrder] Estado no completado:', status);
                return res.status(400).send({ message: 'Order not completed', status: status, details: captureData });
            }

            // Guardar detalles en la venta
            sale.status = 'Pagado';
            sale.payment_details = sale.payment_details || {};
            sale.payment_details.paypal_order_id = orderId;
            // Extraer capture id
            const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
            sale.payment_details.paypal_capture_id = captureId;
            sale.payment_details.paypal_capture_details = captureData;
            sale.paid_at = new Date();
            await sale.save();

            // Si se usó billetera, descontarla ahora
            if (sale.wallet_amount && sale.wallet_amount > 0) {
                try {
                    const wallet = await models.Wallet.findOne({ user: sale.user });
                    if (wallet) {
                        const newBalance = wallet.balance - sale.wallet_amount;
                        wallet.balance = newBalance;
                        wallet.transactions.push({
                            user: sale.user,
                            type: 'debit',
                            amount: sale.wallet_amount,
                            balanceAfter: newBalance,
                            description: `Pago con wallet (mixto) - ${sale.n_transaccion}`,
                            date: new Date(),
                            metadata: { orderId: sale._id, payment_method: 'wallet' }
                        });
                        await wallet.save();
                        console.log('✅ [capturePaypalOrder] Wallet debited for mixed payment.');
                    }
                } catch (walletErr) {
                    console.error('❌ [capturePaypalOrder] Error deducting wallet:', walletErr.message);
                }
            }

            // Procesar venta pagada (acceso a cursos, ganancias instructor, notificaciones)
            await processPaidSale(sale, sale.user);
            
            // 🔥 CORRECCIÓN: Populatar usuario para Telegram
            const saleWithUser = await models.Sale.findById(sale._id).populate('user', 'name surname email').lean();
            notifyPaymentApproved(saleWithUser || sale).catch(console.error);

            return res.status(200).send({ success: true, sale: sale });
        } catch (error) {
            console.error('❌ [capturePaypalOrder] Error:', error.response?.data || error.message || error);
            return res.status(500).send({ message: 'Error capturing PayPal order', details: error.response?.data || error.message });
        }
    },


    /**
     * 🔔 WEBHOOK MERCADO PAGO
     * Recibe notificaciones de pagos actualizados
     */
    async webhook(req, res) {
        // Webhook removed
        res.sendStatus(404);
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
     * 🔥 IMPORTANTE: 
     * - Cuando cambia de Pendiente → Pagado: activa automáticamente el acceso
     * - Cuando cambia a Anulado: revierte billetera + elimina accesos + cancela ganancias
     */
    update_status_sale: async (req, res) => {
        try {
            if (req.user.rol !== 'admin') {
                return res.status(403).json({ message: 'No autorizado' });
            }

            const { id } = req.params;

            // 🛡️ SANITIZE INPUTS
            if (req.body.admin_notes) req.body.admin_notes = DOMPurify.sanitize(req.body.admin_notes);

            const { status, admin_notes } = req.body;

            const sale = await models.Sale.findById(id).populate('user');
            if (!sale) {
                return res.status(404).json({ message: 'Venta no encontrada' });
            }

            const oldStatus = sale.status;

            // ════════════════════════════════════════════════
            // 🔥 CASO 1: RECHAZAR VENTA (Anulado)
            // ════════════════════════════════════════════════
            if (status === 'Anulado' && oldStatus !== 'Anulado') {
                console.log('\n🚨 ═══════════════════════════════════════════════');
                console.log('🚨 [RECHAZO] Anulando venta:', sale._id);
                console.log('🚨 ═══════════════════════════════════════════════');
                console.log(`   📊 Estado anterior: ${oldStatus}`);
                console.log(`   👤 Usuario: ${sale.user.name} ${sale.user.surname}`);
                console.log(`   💰 Total venta: ${sale.total}`);
                console.log(`   💳 Método: ${sale.method_payment}`);

                // ────────────────────────────────────────────────
                // 💸 1. DEVOLVER SALDO DE BILLETERA SI SE USÓ
                // ────────────────────────────────────────────────
                if (sale.wallet_amount && sale.wallet_amount > 0) {
                    console.log(`\n💸 [RECHAZO] Devolviendo ${sale.wallet_amount} a billetera...`);

                    try {
                        // Obtener billetera del usuario
                        const wallet = await models.Wallet.findOne({ user: sale.user._id });

                        if (!wallet) {
                            console.error('❌ [RECHAZO] Billetera no encontrada para usuario');
                        } else {
                            // Crear transacción de reembolso
                            const refundTransaction = {
                                user: sale.user._id, // 🔥 Agregado: Campo requerido
                                type: 'credit', // 🔥 Corregido: 'refund' no existe en enum, usar 'credit'
                                amount: sale.wallet_amount,
                                balanceAfter: wallet.balance + sale.wallet_amount, // Calcular balance
                                description: `Devolución por venta rechazada: ${sale.n_transaccion || sale._id}`,
                                date: new Date(),
                                metadata: {
                                    orderId: sale._id,
                                    reason: 'Venta anulada por administrador',
                                    admin_notes: admin_notes || 'Sin observaciones'
                                }
                            };

                            // Acreditar saldo
                            wallet.balance += sale.wallet_amount;
                            wallet.transactions.push(refundTransaction);
                            await wallet.save();

                            console.log(`✅ [RECHAZO] Billetera reacreditada exitosamente`);
                            console.log(`   💰 Monto devuelto: ${sale.wallet_amount}`);
                            console.log(`   💵 Nuevo saldo: ${wallet.balance}`);
                        }

                    } catch (walletError) {
                        console.error('❌ [RECHAZO] Error al reacreditar billetera:', walletError.message);
                        // Continuar con la anulación, pero loguear el error
                    }
                } else {
                    console.log('ℹ️  [RECHAZO] No se usó billetera en esta venta');
                }

                // ────────────────────────────────────────────────
                // 🗑️ 2. ELIMINAR INSCRIPCIONES SI EXISTEN
                // ────────────────────────────────────────────────
                if (oldStatus === 'Pagado') {
                    console.log('\n🗑️ [RECHAZO] Venta estaba pagada, eliminando accesos...');

                    for (const item of sale.detail) {
                        // Solo los CURSOS tienen modelo CourseStudent
                        if (item.product_type === 'course') {
                            try {
                                const deleted = await models.CourseStudent.deleteMany({
                                    user: sale.user._id,
                                    course: item.product
                                });

                                if (deleted.deletedCount > 0) {
                                    console.log(`   ✅ Acceso eliminado: curso ${item.product}`);
                                } else {
                                    console.log(`   ℹ️  Sin acceso previo: curso ${item.product}`);
                                }
                            } catch (deleteError) {
                                console.error(`   ❌ Error eliminando acceso al curso:`, deleteError.message);
                            }
                        } else if (item.product_type === 'project') {
                            console.log(`   📦 Proyecto ${item.product}: acceso controlado por venta (no requiere eliminación)`);
                        }
                    }
                } else {
                    console.log('ℹ️  [RECHAZO] Venta no estaba pagada, no hay accesos que eliminar');
                }

                // ────────────────────────────────────────────────
                // 💰 3. MARCAR GANANCIAS COMO ANULADAS
                // ────────────────────────────────────────────────
                console.log('\n💰 [RECHAZO] Cancelando ganancias de instructores...');

                try {
                    const earningsUpdate = await models.InstructorEarnings.updateMany(
                        {
                            sale: sale._id,
                            status: { $in: ['pending', 'available'] }
                        },
                        {
                            $set: {
                                status: 'cancelled',
                                admin_notes: admin_notes || 'Venta anulada por administrador',
                                cancelled_at: new Date()
                            }
                        }
                    );

                    if (earningsUpdate.modifiedCount > 0) {
                        console.log(`✅ [RECHAZO] ${earningsUpdate.modifiedCount} ganancia(s) marcadas como anuladas`);
                    } else {
                        console.log('ℹ️  [RECHAZO] No había ganancias pendientes/disponibles para anular');
                    }

                } catch (earningsError) {
                    console.error('❌ [RECHAZO] Error al cancelar ganancias:', earningsError.message);
                }

                console.log('\n✅ [RECHAZO] Proceso de anulación completado');
                console.log('🚨 ═══════════════════════════════════════════════\n');
            }

            // ════════════════════════════════════════════════
            // 🔥 CASO 2: APROBAR VENTA (Pagado)
            // ════════════════════════════════════════════════
            if (oldStatus !== 'Pagado' && status === 'Pagado') {
                console.log('\n🚀 ═══════════════════════════════════════════════');
                console.log('🚀 [APROBACIÓN] Activando acceso para venta:', sale._id);
                console.log('🚀 ═══════════════════════════════════════════════\n');

                await processPaidSale(sale, sale.user._id);
                // sendConfirmationEmail(sale._id).catch(console.error);

                // 🔔 Notificar al estudiante por Telegram
                notifyPaymentApproved(sale).catch(console.error);
            }

            // ────────────────────────────────────────────────
            // ACTUALIZAR ESTADO DE LA VENTA
            // ────────────────────────────────────────────────
            sale.status = status;
            if (admin_notes) {
                sale.admin_notes = admin_notes;
            }
            await sale.save();

            emitSaleStatusUpdate(sale);

            res.status(200).json({
                message: status === 'Anulado'
                    ? '❌ Venta anulada y saldo devuelto'
                    : '✅ Estado actualizado',
                sale
            });

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

            // 🔥 Contar TODAS las ventas pendientes o en revisión (no solo las últimas 10)
            const unreadCount = await models.Sale.countDocuments({
                status: { $in: ['Pendiente', 'En Revisión'] }
            });

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
    },

    /**
     * 🔧 PROCESAR VENTAS EXISTENTES
     * Busca ventas pagadas que no tengan ganancias generadas y las crea.
     * Útil para migración o corrección de datos.
     */
    process_existing_sales: async (req, res) => {
        try {
            console.log('🔧 [process_existing_sales] Iniciando procesamiento manual...');

            // Buscar todas las ventas pagadas
            const sales = await models.Sale.find({ status: 'Pagado' });
            console.log(`🔧 Encontradas ${sales.length} ventas pagadas.`);

            let sales_reviewed = 0;
            let processed = 0;
            let skipped = 0;
            let total = 0;

            const processed_details = [];
            const skipped_details = [];

            for (const sale of sales) {
                sales_reviewed++;

                for (const item of sale.detail) {
                    total++;

                    try {
                        // 1. Validar Instructor
                        // 🔥 FIX: Check both product_type and type_detail
                        const type = item.product_type || item.type_detail;

                        let instructorId = null;
                        if (type === 'course') {
                            const course = await models.Course.findById(item.product).select('user title');
                            instructorId = course?.user;
                            if (course) item.title = course.title; // Asegurar título
                        } else if (type === 'project') {
                            const project = await models.Project.findById(item.product).select('user title');
                            instructorId = project?.user;
                            if (project) item.title = project.title;
                        }

                        if (!instructorId) {
                            skipped++;
                            skipped_details.push({
                                sale: sale.n_transaccion || sale._id,
                                product: item.product,
                                title: item.title,
                                reason: 'Producto sin instructor asignado'
                            });
                            continue;
                        }

                        // 2. Verificar si ya existe ganancia
                        const existing = await models.InstructorEarnings.findOne({
                            sale: sale._id,
                            product_id: item.product
                        });

                        if (existing) {
                            skipped++;
                            // No agregamos a skipped_details para no saturar, ya que es el caso común
                            continue;
                        }

                        // 3. Crear ganancia
                        const created = await createEarningForProduct(sale, item);

                        if (created) {
                            processed++;
                            processed_details.push({
                                sale: sale.n_transaccion || sale._id,
                                product: item.product,
                                title: item.title
                            });
                        } else {
                            // Si retornó false pero no lanzó error (ej. ya existía o sin instructor, aunque esos casos ya los filtramos arriba)
                            // En realidad createEarningForProduct tiene sus propios chequeos, pero nosotros ya hicimos algunos.
                            // Si createEarningForProduct retorna false es porque falló algo interno o validación extra.
                            // Asumimos que si no es created, es skipped.
                            skipped++;
                            // No agregamos detalle genérico
                        }

                    } catch (err) {
                        skipped++;
                        skipped_details.push({
                            sale: sale.n_transaccion || sale._id,
                            product: item.product,
                            title: item.title,
                            reason: 'Error interno',
                            error: err.message
                        });
                    }
                }
            }

            console.log(`✅ [process_existing_sales] Finalizado. Procesados: ${processed}, Omitidos: ${skipped}, Total: ${total}`);

            res.status(200).json({
                success: true,
                message: 'Procesamiento completado',
                processed,
                skipped,
                total,
                sales_reviewed,
                processed_details,
                skipped_details
            });

        } catch (error) {
            console.error('❌ Error en process_existing_sales:', error);
            res.status(500).json({ message: 'Error al procesar ventas existentes', error: error.message });
        }
    },

};
