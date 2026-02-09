import models from "../models/index.js";
import axios from 'axios'; // 🔥 IMPORTAR AXIOS
import { emitNewSaleToAdmins, emitSaleStatusUpdate } from '../services/socket.service.js';
import { notifyNewSale, notifyPaymentApproved } from '../services/telegram.service.js';
import { processPaidSale, createEarningForProduct } from '../services/SaleService.js'; // 🔥 IMPORTAR SERVICIO

import { useWalletBalance } from './WalletController.js';
import { convertUSDByCountry, formatCurrency } from '../services/exchangeRate.service.js'; // 🔥 CONVERSIÓN MULTI-PAÍS

import PaymentSettings from '../models/PaymentSettings.js'; // 🔥 IMPORTAR CONFIGURACIÓN DE PAGO

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

            let { method_payment, currency_payment, n_transaccion, detail, country, coupon_code } = req.body; // 🔥 detail en lugar de items + country, se recibe coupon_code
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
                method_payment: { $in: ['mercadopago', 'mixed_mercadopago', 'transfer'] },
                createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
            });

            if (recentPending) {
                console.log('⚠️ [register] Pago duplicado detectado:', recentPending._id);
                return res.status(409).send({
                    message: 'Ya tienes un pago en proceso. Por favor espera.',
                    pending_sale: recentPending._id,
                    created_at: recentPending.createdAt
                });
            }

            // Calcular total
            let total = 0;
            const sale_details = [];

            // 🔥 VALIDAR CUPÓN (Si existe)
            let isReferralSale = false;
            let validatedCoupon = null;

            if (coupon_code) {
                validatedCoupon = await models.Coupon.findOne({
                    code: coupon_code,
                    active: true,
                    expires_at: { $gt: new Date() }
                });

                if (validatedCoupon) {
                    console.log(`🎟️ [register] Cupón aplicado: ${coupon_code}`);
                    isReferralSale = true;
                } else {
                    console.warn(`⚠️ [register] Cupón inválido/expirado ignorado: ${coupon_code}`);
                }
            }

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
                    product_type: item.product_type, // 🔥 CORREGIDO: 'product_type' no 'type_detail'
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
                    price_dolar: total,
                    total: total,
                    status: 'Pagado', // 🔥 IMPORTANTE: Estado Pagado
                    wallet_amount: total,
                    remaining_amount: 0
                });

                // 4. Procesar accesos y notificaciones
                await processPaidSale(sale, user_id);
                notifyPaymentApproved(sale).catch(console.error);

                return res.status(200).send({
                    message: 'Compra realizada con éxito',
                    sale: sale,
                    wallet_used: total,
                    fully_paid: true
                });
            }

            // ✅ MERCADO PAGO REMOVED: Not supported anymore
            if (method_payment === 'mercadopago' || method_payment === 'mixed_mercadopago') {
                return res.status(400).send({ message: 'MercadoPago no soportado. Por favor utiliza PayPal.' });
            }

            // ═══════════════════════════════════════════════
            // 🔥 MÉTODO 2: PAYPAL (Creación de orden y captura)
            // ═══════════════════════════════════════════════
            if (method_payment === 'paypal') {
                console.log('🅿️ [register] Método seleccionado: paypal');

                const { use_wallet, wallet_amount, remaining_amount } = req.body;
                const finalWalletAmount = (use_wallet && wallet_amount > 0) ? Number(wallet_amount) : 0;
                const finalRemainingAmount = remaining_amount ? Number(remaining_amount) : (total - finalWalletAmount);

                // Solo validar saldo de wallet si se indica
                if (finalWalletAmount > 0) {
                    const wallet = await models.Wallet.findOne({ user: user_id });
                    if (!wallet) return res.status(400).send({ message: 'Billetera no encontrada' });
                    if (wallet.balance < finalWalletAmount) return res.status(400).send({ message: 'Saldo insuficiente en billetera', available: wallet.balance, required: finalWalletAmount });
                }

                return res.status(200).send({
                    message: 'Validación exitosa. Procede con PayPal.',
                    validated: true,
                    n_transaccion: n_transaccion,
                    total: total,
                    wallet_amount: finalWalletAmount,
                    paypal_amount: finalRemainingAmount,
                    detail: sale_details
                });
            }

            // 🔥 PARA OTROS MÉTODOS (Wallet/Transferencia): SÍ CREAR VENTA
            console.log(`🏦 [register] Método seleccionado: ${method_payment}`);

            // 🔥 CONVERTIR USD → MONEDA LOCAL SEGÚN PAÍS
            const conversion = await convertUSDByCountry(total, userCountry);

            console.log('💱 [register] Conversión para el usuario:', {
                total_usd: formatCurrency(conversion.usd, 'USD'),
                total_local: formatCurrency(conversion.amount, conversion.currency),
                currency: conversion.currency,
                country: conversion.country,
                exchange_rate: conversion.rate
            });

            // Crear la venta
            const sale = await models.Sale.create({
                user: user_id,
                method_payment,
                currency_payment: 'USD', // 🔥 SIEMPRE guardamos en USD
                n_transaccion: n_transaccion || `TXN-${Date.now()}`,
                detail: sale_details,
                price_dolar: total, // 🔥 Precio en USD
                total: total, // 🔥 Total en USD
                status: 'Pendiente', // Pendiente de aprobación admin
                // 🔥 NUEVO: Guardar info de conversión multi-país
                conversion_rate: conversion.rate,
                conversion_currency: conversion.currency,
                conversion_amount: conversion.amount,
                conversion_country: userCountry,
                // 🔥 REFERIDOS
                coupon_code: isReferralSale ? coupon_code : null,
                is_referral: isReferralSale
            });

            console.log('✅ [register] Venta creada:', sale._id);
            console.log(`   💵 Total USD: ${formatCurrency(total, 'USD')}`);
            console.log(`   💵 Total ${conversion.currency} (referencia): ${formatCurrency(conversion.amount, conversion.currency)}`);

            // 🔥 PARA TRANSFERENCIA: Retornar datos bancarios con monto en MONEDA LOCAL
            if (method_payment === 'transfer') { // 🔥 CORREGIDO: 'transfer' en lugar de 'transferencia' para coincidir con el frontend
                return res.status(200).send({
                    message: 'Venta registrada. Por favor realiza la transferencia.',
                    sale: sale,
                    n_transaccion: n_transaccion,
                    // 🔥 INFORMACIÓN PARA EL USUARIO CON MONEDA LOCAL
                    payment_info: {
                        amount_usd: total,
                        amount_local: conversion.amount,
                        currency: conversion.currency,
                        country: conversion.country,
                        symbol: conversion.symbol,
                        exchange_rate: conversion.rate,
                        formatted_usd: formatCurrency(total, 'USD'),
                        formatted_local: formatCurrency(conversion.amount, conversion.currency)
                    },
                    // 🔥 DATOS BANCARIOS (desde tu .env o hardcoded)
                    bank_details: {
                        bank_name: 'BBVA México',
                        account_holder: 'Tu Nombre o Empresa',
                        account_number: '1234567890',
                        clabe: '012345678901234567',
                        reference: n_transaccion
                    }
                });
            }

            // Para otros métodos
            return res.status(200).send({
                message: 'Pago procesado exitosamente',
                sale: sale,
                wallet_used: 0,
                remaining_amount: 0,
                fully_paid: false
            });

        } catch (error) {
            console.error('❌ [register] Error general:', error);
            return res.status(500).send({
                message: 'Error al procesar el pago',
                error: error.message
            });
        }
    },

    createPaypalOrder: async (req, res) => {
        try {
            const { n_transaccion, total, detail } = req.body;

            if (!n_transaccion || !total || !detail) {
                return res.status(400).send({ message: 'n_transaccion, total y detail son requeridos' });
            }

            // 🔥 OBTENER CONFIGURACIÓN DE PAGO DESDE BD
            let paymentSettings = await PaymentSettings.findOne();

            // Determinar MODO
            const PAYPAL_MODE = paymentSettings?.paypal?.mode || process.env.PAYPAL_MODE || 'sandbox';

            let PAYPAL_CLIENT_ID = '';
            let PAYPAL_CLIENT_SECRET = '';

            // Obtener credenciales según el modo
            if (PAYPAL_MODE === 'sandbox') {
                PAYPAL_CLIENT_ID = paymentSettings?.paypal?.sandbox?.clientId || process.env.PAYPAL_CLIENT_ID;
                PAYPAL_CLIENT_SECRET = paymentSettings?.paypal?.sandbox?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
            } else {
                PAYPAL_CLIENT_ID = paymentSettings?.paypal?.live?.clientId || process.env.PAYPAL_CLIENT_ID;
                PAYPAL_CLIENT_SECRET = paymentSettings?.paypal?.live?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
            }

            if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
                console.error(`❌ [createPaypalOrder] Credenciales de PayPal (${PAYPAL_MODE}) no configuradas`);
                return res.status(500).send({ message: 'Error de configuración en pasarela de pago' });
            }

            const PAYPAL_API = PAYPAL_MODE === 'sandbox' ? 'https://api.sandbox.paypal.com' : 'https://api.paypal.com';

            // Obtener token de acceso PayPal
            const tokenR = await axios({
                method: 'post',
                url: `${PAYPAL_API}/v1/oauth2/token`,
                auth: {
                    username: PAYPAL_CLIENT_ID.trim(),
                    password: PAYPAL_CLIENT_SECRET.trim()
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
                                value: Number(total).toFixed(2)
                            },
                            description: `Compra ${n_transaccion}`
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

    capturePaypalOrder: async (req, res) => {
        try {
            const { n_transaccion, orderId, detail, total, wallet_amount, remaining_amount, coupon_code } = req.body;
            const user_id = req.user._id;

            if (!n_transaccion || !orderId || !detail || !total) {
                return res.status(400).send({ message: 'Faltan datos requeridos' });
            }

            // Evitar duplicados
            const existingSale = await models.Sale.findOne({ n_transaccion });
            if (existingSale && existingSale.status === 'Pagado') {
                return res.status(400).send({ message: 'Esta transacción ya fue procesada', sale: existingSale });
            }

            // 🔥 VALIDAR CUPÓN (Si existe) - Misma lógica que en register
            let isReferralSale = false;
            let validatedCoupon = null;

            if (coupon_code) {
                validatedCoupon = await models.Coupon.findOne({
                    code: coupon_code,
                    active: true,
                    expires_at: { $gt: new Date() }
                });

                if (validatedCoupon) {
                    isReferralSale = true;
                }
            }

            // 🔥 OBTENER CONFIGURACIÓN DE PAGO DESDE BD
            let paymentSettings = await PaymentSettings.findOne();

            // Determinar MODO
            const PAYPAL_MODE = paymentSettings?.paypal?.mode || process.env.PAYPAL_MODE || 'sandbox';

            let PAYPAL_CLIENT_ID = '';
            let PAYPAL_CLIENT_SECRET = '';

            // Obtener credenciales según el modo
            if (PAYPAL_MODE === 'sandbox') {
                PAYPAL_CLIENT_ID = paymentSettings?.paypal?.sandbox?.clientId || process.env.PAYPAL_CLIENT_ID;
                PAYPAL_CLIENT_SECRET = paymentSettings?.paypal?.sandbox?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
            } else {
                PAYPAL_CLIENT_ID = paymentSettings?.paypal?.live?.clientId || process.env.PAYPAL_CLIENT_ID;
                PAYPAL_CLIENT_SECRET = paymentSettings?.paypal?.live?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
            }

            if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
                console.error(`❌ [capturePaypalOrder] Credenciales de PayPal (${PAYPAL_MODE}) no configuradas`);
                return res.status(500).send({ message: 'Error de configuración en pasarela de pago' });
            }

            const PAYPAL_API = PAYPAL_MODE === 'sandbox' ? 'https://api.sandbox.paypal.com' : 'https://api.paypal.com';

            // Obtener token de acceso PayPal
            const tokenR = await axios({
                method: 'post',
                url: `${PAYPAL_API}/v1/oauth2/token`,
                auth: {
                    username: PAYPAL_CLIENT_ID.trim(),
                    password: PAYPAL_CLIENT_SECRET.trim()
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
                data: {}
            });

            const captureData = captureR.data;
            const status = captureData.status;

            if (status !== 'COMPLETED') {
                return res.status(400).send({ message: 'Order not completed', status, details: captureData });
            }

            // Descontar wallet si aplica
            const finalWalletAmount = wallet_amount ? Number(wallet_amount) : 0;
            if (finalWalletAmount > 0) {
                const wallet = await models.Wallet.findOne({ user: user_id });
                if (!wallet) return res.status(400).send({ message: 'Billetera no encontrada' });
                if (wallet.balance < finalWalletAmount) return res.status(400).send({ message: 'Saldo insuficiente en billetera', available: wallet.balance, required: finalWalletAmount });

                wallet.balance -= finalWalletAmount;
                wallet.transactions.push({ user: user_id, type: 'debit', amount: finalWalletAmount, balanceAfter: wallet.balance, description: `Pago mixto (wallet) - ${n_transaccion}`, date: new Date(), metadata: { orderId: n_transaccion, payment_method: 'mixed_paypal', paypal_order_id: orderId, status: 'completed' } });
                await wallet.save();
            }

            // Crear venta
            const sale = await models.Sale.create({
                user: user_id,
                method_payment: finalWalletAmount > 0 ? 'mixed_paypal' : 'paypal',
                currency_payment: 'MXN',
                n_transaccion: n_transaccion,
                detail: detail,
                total: total,
                status: 'Pagado',
                wallet_amount: finalWalletAmount,
                remaining_amount: remaining_amount || (total - finalWalletAmount),
                payment_details: { paypal_order_id: orderId, paypal_capture_details: captureData },
                paid_at: new Date(),
                // 🔥 REFERIDOS
                coupon_code: isReferralSale ? coupon_code : null,
                is_referral: isReferralSale
            });

            await processPaidSale(sale, user_id);
            const saleWithUser = await models.Sale.findById(sale._id).populate('user', 'name surname email').lean();
            notifyPaymentApproved(saleWithUser || sale).catch(console.error);

            return res.status(200).send({ success: true, sale, message: 'Pago capturado exitosamente' });

        } catch (error) {
            console.error('❌ [capturePaypalOrder] Error:', error.response?.data || error.message || error);
            return res.status(500).send({ message: 'Error capturing PayPal order', details: error.response?.data || error.message });
        }
    },
    /**
     * 🔔 WEBHOOK (Placeholder)
     * Ya no se utiliza para Mercado Pago. Podría adaptarse para otros servicios.
     */
    async webhook(req, res) {
        console.log('🔔 [WEBHOOK] Notificación recibida, pero no hay acción configurada.');
        // La lógica de Mercado Pago ha sido eliminada.
        // Si se necesita un webhook para PayPal u otro servicio, se debe implementar aquí.
        res.sendStatus(200);
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
                                type: 'refund',
                                amount: sale.wallet_amount,
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
            let sales = await models.Sale.find({ user: req.user._id })
                .populate({ path: 'detail.product', select: 'title imagen' })
                .sort({ createdAt: -1 })
                .lean();

            // 🔥 VERIFICAR PAGOS A INSTRUCTORES (Para bloquear reembolsos)
            const saleIds = sales.map(s => s._id);

            // 1. Verificar Ganancias directas marcadas como pagadas
            const paidEarnings = await models.InstructorEarnings.find({
                sale: { $in: saleIds },
                status: 'paid'
            }).select('sale').lean();

            // 2. Verificar Retenciones/Desgloses marcados como pagados o declarados
            // Esto cubre el flujo de impuestos donde se paga al instructor vía retención
            const paidRetentions = await models.InstructorRetention.find({
                sale: { $in: saleIds },
                status: { $in: ['paid', 'declared'] }
            }).select('sale').lean();

            const paidSaleIds = new Set([
                ...paidEarnings.map(e => e.sale.toString()),
                ...paidRetentions.map(r => r.sale.toString())
            ]);

            // Obtener reembolsos
            const refunds = await models.Refund.find({ sale: { $in: saleIds } }).lean();
            const refundMap = new Map();
            refunds.forEach(r => {
                if (!refundMap.has(r.sale.toString())) {
                    refundMap.set(r.sale.toString(), []);
                }
                refundMap.get(r.sale.toString()).push(r);
            });

            sales = sales.map(sale => {
                const saleRefunds = refundMap.get(sale._id.toString()) || [];
                // Determinar estado general de reembolso
                let refundStatus = null;
                if (saleRefunds.length > 0) {
                    refundStatus = saleRefunds[0];
                }

                return {
                    ...sale,
                    refund: refundStatus,
                    refunds: saleRefunds,
                    instructor_paid: paidSaleIds.has(sale._id.toString())
                };
            });

            res.status(200).json({ sales });

        } catch (error) {
            console.error("❌ Error en my_transactions:", error);
            res.status(500).json({ message: "Error al obtener historial" });
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
                        let instructorId = null;
                        if (item.product_type === 'course') {
                            const course = await models.Course.findById(item.product).select('user title');
                            instructorId = course?.user;
                            if (course) item.title = course.title; // Asegurar título
                        } else if (item.product_type === 'project') {
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

    /**
     * 🖼️ OBTENER IMAGEN DEL VOUCHER
     */
    get_voucher_image: async (req, res) => {
        try {
            const img = req.params.image;
            const path_img = path.join(__dirname, '../uploads/transfers/', img);

            if (fs.existsSync(path_img)) {
                res.sendFile(path.resolve(path_img));
            } else {
                const path_default = path.join(__dirname, '../uploads/default.jpg');
                res.sendFile(path.resolve(path_default));
            }
        } catch (error) {
            console.log(error);
            res.status(500).send({ message: 'HUBO UN ERROR' });
        }
    }
};
