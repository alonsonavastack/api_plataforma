import models from "../models/index.js";
// axios eliminado — ya no se usa PayPal
import { emitNewSaleToAdmins, emitSaleStatusUpdate } from '../services/socket.service.js';
import { notifyNewSale, notifyPaymentApproved } from '../services/telegram.service.js';
import * as socketService from '../services/socket.service.js';
import * as telegramService from '../services/telegram.service.js';
import * as SaleService from '../services/SaleService.js';
import { processPaidSale, createEarningForProduct } from '../services/SaleService.js'; // ✅ FIX: import directo

import { useWalletBalance } from './WalletController.js';
import { convertUSDByCountry, formatCurrency } from '../services/exchangeRate.service.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import stripeService from '../services/stripe.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import InstructorRetention from '../models/InstructorRetention.js';
import PlatformCommissionBreakdown from '../models/PlatformCommissionBreakdown.js';
import stripeDefault from '../services/stripe.service.js';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * 🔒 Helper: recarga una venta desde BD SIN populate para garantizar
 * que detail.product sea ObjectId puro (no objeto populado).
 * Indispensable antes de llamar processPaidSale desde auto-verificación.
 */
async function reloadSaleClean(saleId) {
    return await models.Sale.findById(saleId).lean();
}

export default {
    async register(req, res) {
        try {

            if (req.body.method_payment) req.body.method_payment = DOMPurify.sanitize(req.body.method_payment);
            if (req.body.currency_payment) req.body.currency_payment = DOMPurify.sanitize(req.body.currency_payment);
            if (req.body.n_transaccion) req.body.n_transaccion = DOMPurify.sanitize(req.body.n_transaccion);
            if (req.body.country) req.body.country = DOMPurify.sanitize(req.body.country);

            let { method_payment, currency_payment, n_transaccion, detail, country, coupon_code } = req.body;
            const user_id = req.user._id;
            const userCountry = country || 'MX';

            if (!n_transaccion) {
                n_transaccion = `TXN-${Date.now()}`;
            }

            console.log('🛒 [register] Iniciando proceso de pago...', {
                method_payment,
                user_id,
                items_count: detail?.length
            });

            // Prevenir pagos duplicados Stripe y limpiar ventas pendientes anteriores
            if (method_payment === 'stripe' || method_payment === 'mixed_stripe') {
                const productIds = (detail || []).map(d => d.product);

                // Buscar TODAS las ventas pendientes del usuario para estos productos
                const pendingSales = await models.Sale.find({
                    user: user_id,
                    status: 'Pendiente',
                    method_payment: { $in: ['stripe', 'mixed_stripe'] },
                    'detail.product': { $in: productIds },
                    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // últimas 1 hora
                });

                for (const pendingSale of pendingSales) {
                    // Verificar si la sesión Stripe sigue abierta
                    if (pendingSale.stripe_session_id) {
                        try {
                            const existingSession = await stripeDefault.checkout.sessions.retrieve(pendingSale.stripe_session_id);
                            if (existingSession && existingSession.status === 'open') {
                                // Sesión activa → reutilizar
                                console.log('⚠️ [register] Sesión Stripe activa reutilizada:', pendingSale._id);
                                return res.status(200).send({
                                    message: 'Ya tienes un pago en proceso.',
                                    sale: pendingSale,
                                    session_url: existingSession.url,
                                    wallet_used: 0,
                                    remaining_amount: 0,
                                    fully_paid: false
                                });
                            }
                            // Sesión expirada o cancelada → anular y devolver wallet
                            console.log(`🔄 [register] Sesión Stripe expirada, anulando venta anterior: ${pendingSale._id}`);
                        } catch (e) {
                            // Error al recuperar sesión → también anular
                            console.log(`🔄 [register] Error al verificar sesión, anulando venta anterior: ${pendingSale._id}`);
                        }
                    }

                    // Devolver wallet si se habia reservado
                    if (pendingSale.wallet_amount && pendingSale.wallet_amount > 0) {
                        try {
                            const wallet = await models.Wallet.findOne({ user: user_id });
                            if (wallet) {
                                wallet.balance = parseFloat((wallet.balance + pendingSale.wallet_amount).toFixed(2));
                                wallet.transactions.push({
                                    user: user_id,
                                    type: 'refund',
                                    amount: pendingSale.wallet_amount,
                                    balanceAfter: wallet.balance,
                                    description: `Reembolso automático - pago cancelado ${pendingSale.n_transaccion}`,
                                    date: new Date(),
                                    metadata: { orderId: pendingSale._id, reason: 'Sesión Stripe expirada, nuevo intento' }
                                });
                                await wallet.save();
                                console.log(`✅ [register] Wallet devuelto: ${pendingSale.wallet_amount} MXN`);
                            }
                        } catch (walletErr) {
                            console.error('❌ [register] Error devolviendo wallet:', walletErr.message);
                        }
                    }

                    // Anular la venta anterior
                    await models.Sale.updateOne({ _id: pendingSale._id }, { status: 'Anulado' });
                    console.log(`✅ [register] Venta anterior anulada: ${pendingSale._id}`);
                }
            }

            if (method_payment === 'transfer') {
                const recentTransfer = await models.Sale.findOne({
                    user: user_id,
                    status: 'Pendiente',
                    method_payment: 'transfer',
                    createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
                });
                if (recentTransfer) {
                    return res.status(409).send({
                        message: 'Ya tienes un pago en proceso. Por favor espera.',
                        pending_sale: recentTransfer._id,
                        created_at: recentTransfer.createdAt
                    });
                }
            }

            let total = 0;
            const sale_details = [];

            let isReferralSale = false;
            let validatedCoupon = null;

            if (coupon_code) {
                const normalizedCode = coupon_code.trim().toUpperCase();
                validatedCoupon = await models.Coupon.findOne({
                    code: normalizedCode,
                    active: true,
                    expires_at: { $gt: new Date() }
                });

                if (validatedCoupon) {
                    const productIds = (detail || []).map(d => d.product?.toString());
                    const couponProductIds = validatedCoupon.projects.map(p => p.toString());
                    const appliestoProduct = productIds.some(pid => couponProductIds.includes(pid));

                    if (appliestoProduct) {
                        coupon_code = normalizedCode;
                        isReferralSale = true;
                        console.log(`🎟️ [register] Cupón de referido aplicado: ${coupon_code} → comisión 80/20`);
                    } else {
                        console.warn(`⚠️ [register] Cupón ${coupon_code} no aplica a ningún producto del pedido, ignorado`);
                        validatedCoupon = null;
                    }
                } else {
                    console.warn(`⚠️ [register] Cupón inválido/expirado ignorado: ${coupon_code}`);
                }
            }

            const items = detail || [];

            // Validar productos
            for (const item of items) {
                if (item.product_type === 'course') {
                    const course = await models.Course.findById(item.product);
                    if (!course) return res.status(404).send({ message: `El curso "${item.title}" no existe` });
                    if (course.state !== 2) return res.status(400).send({ message: `El curso "${item.title}" no está disponible` });
                } else if (item.product_type === 'project') {
                    const project = await models.Project.findById(item.product);
                    if (!project) return res.status(404).send({ message: `El proyecto "${item.title}" no existe` });
                    if (project.state !== 2) return res.status(400).send({ message: `El proyecto "${item.title}" no está disponible` });
                }
            }

            for (const item of items) {
                sale_details.push({
                    product: item.product,
                    product_type: item.product_type,
                    title: item.title,
                    price_unit: item.price_unit,
                    discount: item.discount || 0,
                    type_discount: item.type_discount || 0,
                    campaign_discount: item.campaign_discount || null
                });
                total += item.price_unit;
            }

            // ─── PAGO 100% BILLETERA ─────────────────────────────────────────────
            if (method_payment === 'wallet') {
                console.log('💰 [register] Método seleccionado: wallet (100% billetera)');

                const wallet = await models.Wallet.findOne({ user: user_id });
                if (!wallet) return res.status(400).send({ message: 'Billetera no encontrada' });
                if (wallet.balance < total) {
                    return res.status(400).send({
                        message: 'Saldo insuficiente en billetera',
                        available: wallet.balance,
                        required: total
                    });
                }

                const newBalance = wallet.balance - total;
                wallet.balance = newBalance;
                wallet.transactions.push({
                    user: user_id,
                    type: 'debit',
                    amount: total,
                    balanceAfter: newBalance,
                    description: `Pago compra - ${n_transaccion}`,
                    date: new Date(),
                    metadata: { orderId: n_transaccion, payment_method: 'wallet', status: 'completed' }
                });
                await wallet.save();

                const sale = await models.Sale.create({
                    user: user_id,
                    method_payment: 'wallet',
                    currency_payment: currency_payment || 'MXN',
                    n_transaccion: n_transaccion,
                    detail: sale_details,
                    total: total,
                    status: 'Pagado',
                    wallet_amount: total,
                    remaining_amount: 0,
                    coupon_code: isReferralSale ? coupon_code : null,
                    is_referral: isReferralSale,
                    coupon_id: isReferralSale && validatedCoupon ? validatedCoupon._id : null
                });

                // Procesar en background — no bloquea la respuesta al cliente ✅
                processPaidSale(sale, user_id).catch(err => {
                    console.error('⚠️ [register/wallet] Error en processPaidSale (no crítico):', err.message);
                });
                notifyPaymentApproved(sale).catch(console.error);

                return res.status(200).send({
                    message: 'Compra realizada con éxito',
                    sale: sale,
                    wallet_used: total,
                    fully_paid: true
                });
            }

            // Métodos eliminados
            if (['mercadopago', 'mixed_mercadopago', 'paypal', 'mixed_paypal'].includes(method_payment)) {
                return res.status(400).send({ message: 'Método de pago no disponible. Usa Stripe, billetera o transferencia.' });
            }

            console.log(`🏦 [register] Método seleccionado: ${method_payment}`);

            const conversion = await convertUSDByCountry(total, userCountry);

            console.log('💱 [register] Conversión:', {
                total_usd: formatCurrency(conversion.usd || total, 'USD'),
                total_local: formatCurrency(conversion.amount, conversion.currency),
                currency: conversion.currency,
                exchange_rate: conversion.rate
            });

            let wallet_used = 0;
            let remaining_usd = total;
            const final_n_transaccion = n_transaccion || `TXN-${Date.now()}`;

            // ─── PAGO MIXTO (Billetera + Stripe) ────────────────────────────────
            if (method_payment === 'mixed_stripe') {
                console.log('💰 [register] Método mixto: Stripe + Billetera');
                const wallet = await models.Wallet.findOne({ user: user_id });
                if (!wallet || wallet.balance <= 0) {
                    return res.status(400).send({ message: 'No tienes saldo en tu billetera para usar pago mixto.' });
                }

                // ── Mínimo que Stripe acepta en MXN ──────────────────────────────
                const STRIPE_MIN_MXN = 10; // Stripe México: mínimo $10 MXN

                let desiredWalletUse = parseFloat((wallet.balance >= total ? total : wallet.balance).toFixed(2));
                let proposedRemaining = parseFloat((total - desiredWalletUse).toFixed(2));

                // Si el restante quedaría entre $0.01 y $9.99 MXN, ajustamos el wallet
                // para que Stripe reciba exactamente el mínimo ($10 MXN)
                if (proposedRemaining > 0 && proposedRemaining < STRIPE_MIN_MXN) {
                    const adjustment = parseFloat((STRIPE_MIN_MXN - proposedRemaining).toFixed(2));
                    desiredWalletUse = parseFloat((desiredWalletUse - adjustment).toFixed(2));
                    proposedRemaining = STRIPE_MIN_MXN;
                    console.log(`⚙️ [register] Ajuste mínimo Stripe: wallet reducido a ${desiredWalletUse}, Stripe recibirá ${proposedRemaining}`);
                }

                // Si tras ajuste el wallet quedaría negativo, el saldo es insuficiente
                if (desiredWalletUse < 0 || wallet.balance < desiredWalletUse) {
                    return res.status(400).send({
                        message: `Tu saldo en billetera (${wallet.balance.toFixed(2)} MXN) no es suficiente. Stripe requiere un mínimo de ${STRIPE_MIN_MXN} MXN como pago con tarjeta.`
                    });
                }

                wallet_used = desiredWalletUse;
                remaining_usd = proposedRemaining;

                if (remaining_usd <= 0) {
                    return res.status(400).send({ message: 'Tu saldo cubre el total. Por favor selecciona Billetera como método de pago exclusivo.' });
                }

                wallet.balance = parseFloat((wallet.balance - wallet_used).toFixed(2));
                wallet.transactions.push({
                    user: user_id,
                    type: 'debit',
                    amount: wallet_used,
                    balanceAfter: wallet.balance,
                    description: `Reserva pago mixto - ${final_n_transaccion}`,
                    date: new Date(),
                    metadata: { orderId: final_n_transaccion, payment_method: 'mixed_stripe', status: 'pending' }
                });
                await wallet.save();
                console.log(`✅ [register] Reservados ${wallet_used} MXN de billetera. Stripe recibirá: ${remaining_usd} MXN`);
            }

            const sale = await models.Sale.create({
                user: user_id,
                method_payment,
                currency_payment: 'MXN',
                n_transaccion: final_n_transaccion,
                detail: sale_details,
                total: total,
                status: 'Pendiente',
                wallet_amount: wallet_used,
                remaining_amount: remaining_usd,
                coupon_code: isReferralSale ? coupon_code : null,
                is_referral: isReferralSale,
                coupon_id: isReferralSale && validatedCoupon ? validatedCoupon._id : null
            });

            console.log('✅ [register] Venta creada:', sale._id);

            // ─── TRANSFERENCIA ───────────────────────────────────────────────────
            if (method_payment === 'transfer') {
                return res.status(200).send({
                    message: 'Venta registrada. Por favor realiza la transferencia.',
                    sale: sale,
                    n_transaccion: n_transaccion,
                    payment_info: {
                        amount_usd: total,
                        amount_local: conversion.amount,
                        currency: conversion.currency,
                        exchange_rate: conversion.rate,
                        formatted_local: formatCurrency(conversion.amount, conversion.currency)
                    },
                    bank_details: {
                        bank_name: 'BBVA México',
                        account_holder: 'Tu Nombre o Empresa',
                        account_number: '1234567890',
                        clabe: '012345678901234567',
                        reference: n_transaccion
                    }
                });
            }

            // ─── STRIPE / MIXED STRIPE ───────────────────────────────────────────
            if (method_payment === 'stripe' || method_payment === 'mixed_stripe') {
                console.log(`💳 [register] Generando Stripe Checkout Session para ${method_payment}...`);

                // ── Construir line_items para Stripe ────────────────────────────
                // Si hay múltiples items, distribuimos el monto restante proporcionalmente.
                // Al último item le asignamos el residuo para evitar errores de redondeo.
                let accumulatedCents = 0;
                const totalRemainingCents = Math.round(remaining_usd * 100);

                const line_items = sale_details.map((item, index) => {
                    let unitPriceCents;
                    if (index === sale_details.length - 1) {
                        // Último item: toma el residuo exacto para que la suma cuadre
                        unitPriceCents = totalRemainingCents - accumulatedCents;
                    } else {
                        const proportion = total > 0 ? (item.price_unit / total) : 0;
                        unitPriceCents = Math.round(remaining_usd * proportion * 100);
                        accumulatedCents += unitPriceCents;
                    }

                    // Garantizar mínimo de Stripe (1000 centavos = $10 MXN) por item
                    if (unitPriceCents < 1000) {
                        console.warn(`⚠️ [register] Item "${item.title}" tiene ${unitPriceCents} centavos → ajustado a 1000 (mínimo Stripe)`);
                        unitPriceCents = 1000;
                    }

                    return {
                        price_data: {
                            currency: (conversion.currency || 'MXN').toLowerCase(),
                            product_data: { name: item.title },
                            unit_amount: unitPriceCents,
                        },
                        quantity: 1,
                    };
                });

                const session = await stripeDefault.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: line_items,
                    mode: 'payment',
                    success_url: `${process.env.URL_FRONTEND}/payment-success?payment_success=true&sale_id=${sale._id}`,
                    cancel_url: `${process.env.URL_FRONTEND}/checkout?payment_canceled=true`,
                    client_reference_id: sale._id.toString(),
                    metadata: {
                        sale_id: sale._id.toString(),
                        user_id: user_id.toString(),
                        n_transaccion: sale.n_transaccion,
                        wallet_used: wallet_used > 0 ? 'true' : 'false',
                        coupon_code: isReferralSale ? (coupon_code || '') : '',
                        is_referral: isReferralSale ? 'true' : 'false'
                    }
                });

                console.log(`✅ [register] Stripe Session creada: ${session.id}`);
                sale.stripe_session_id = session.id;
                await sale.save();

                return res.status(200).send({
                    message: 'Redirigiendo a Stripe...',
                    sale: sale,
                    session_url: session.url,
                    wallet_used: 0,
                    remaining_amount: 0,
                    fully_paid: false
                });
            }

            return res.status(200).send({
                message: 'Pago registrado exitosamente (Pendiente)',
                sale: sale,
                wallet_used: wallet_used,
                remaining_amount: remaining_usd,
                fully_paid: false
            });

        } catch (error) {
            console.error('❌ [register] Error general:', error);
            // 🔧 Log detallado para errores de Stripe
            if (error?.type?.startsWith('Stripe') || error?.raw) {
                console.error('❌ [register] Stripe error detallado:', {
                    type: error.type,
                    code: error.code,
                    param: error.param,
                    message: error.message,
                    raw: error.raw
                });
            }
            return res.status(500).send({
                message: error?.message || 'Error al procesar el pago',
                stripe_error: error?.code || null
            });
        }
    },

    _removed: async (req, res) => { res.status(410).send({ message: 'Eliminado' }); },

    list: async (req, res) => {
        try {
            const { search, status, month, year, exclude_refunded, user: userId } = req.query;
            const user = req.user;

            let filter = { status: { $ne: 'Anulado' } };

            if (userId) filter.user = userId;

            if (exclude_refunded === 'true') {
                const refundedSales = await models.Refund.find({ status: 'completed', state: 1 }).distinct('sale');
                if (refundedSales.length > 0) filter._id = { $nin: refundedSales };
            }

            if (status) filter.status = status;

            if (month && year) {
                filter.createdAt = { $gte: new Date(year, month - 1, 1), $lte: new Date(year, month, 0, 23, 59, 59, 999) };
            } else if (year) {
                filter.createdAt = { $gte: new Date(year, 0, 1), $lte: new Date(year, 11, 31, 23, 59, 59, 999) };
            }

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

            if (user.rol === 'instructor') {
                const courses = await models.Course.find({ user: user._id }).select('_id');
                const projects = await models.Project.find({ user: user._id }).select('_id');
                const productIds = [...courses, ...projects].map(p => p._id);
                filter['detail'] = { $elemMatch: { product: { $in: productIds } } };
            }

            let sales = await models.Sale.find(filter)
                .populate('user', 'name surname email')
                .populate({ path: 'detail.product', select: 'title imagen user' })
                .sort({ createdAt: -1 });

            // Auto-verificación Stripe
            for (let sale of sales) {
                if (sale.status === 'Pendiente' &&
                    (sale.method_payment === 'stripe' || sale.method_payment === 'mixed_stripe') &&
                    sale.stripe_session_id) {
                    try {
                        const session = await stripeService.checkout.sessions.retrieve(sale.stripe_session_id);
                        if (session && session.payment_status === 'paid') {
                            console.log(`✅ [list] Auto-aprobando venta Stripe ${sale._id}`);
                            sale.status = 'Pagado';
                            sale.n_transaccion = session.payment_intent || sale.n_transaccion;
                            await sale.save();
                            // 🔒 Recargar sin populate para que detail.product sea ObjectId puro
                            const saleClean = await reloadSaleClean(sale._id);
                            const userId = saleClean.user;
                            processPaidSale(saleClean, userId).catch(console.error);
                            telegramService.notifyPaymentApproved(sale).catch(console.error);
                            socketService.emitSaleStatusUpdate(sale);
                        }
                    } catch (verifyError) {
                        console.error(`❌ [list] Error auto-verificando Stripe:`, verifyError.message);
                    }
                }
            }

            sales = sales.map(s => typeof s.toObject === 'function' ? s.toObject() : s);

            const saleIds = sales.map(s => s._id);
            const refunds = await models.Refund.find({ sale: { $in: saleIds }, state: 1 }).lean();
            const refundMap = new Map(refunds.map(r => [r.sale.toString(), r]));

            sales = sales.map(sale => ({
                ...sale,
                refund: refundMap.get(sale._id.toString()) || null
            }));

            if (user.rol === 'instructor') {
                const productIdStrings = [
                    ...await models.Course.find({ user: user._id }).select('_id'),
                    ...await models.Project.find({ user: user._id }).select('_id')
                ].map(p => p._id.toString());

                sales = sales.map(sale => ({
                    ...sale,
                    detail: sale.detail.filter(item =>
                        item.product && productIdStrings.includes(item.product._id?.toString())
                    )
                })).filter(sale => sale.detail.length > 0);
            }

            console.log(`✅ [list] Devolviendo ${sales.length} ventas`);
            res.status(200).json({ sales });

        } catch (error) {
            console.error("❌ Error en list:", error);
            res.status(500).json({ message: "Error al obtener ventas" });
        }
    },

    update_status_sale: async (req, res) => {
        try {
            if (req.user.rol !== 'admin') return res.status(403).json({ message: 'No autorizado' });

            const { id } = req.params;
            if (req.body.admin_notes) req.body.admin_notes = DOMPurify.sanitize(req.body.admin_notes);
            const { status, admin_notes } = req.body;

            const sale = await models.Sale.findById(id).populate('user');
            if (!sale) return res.status(404).json({ message: 'Venta no encontrada' });

            const oldStatus = sale.status;

            // ── ANULAR ───────────────────────────────────────────────────────────
            if (status === 'Anulado' && oldStatus !== 'Anulado') {
                console.log('🚨 [RECHAZO] Anulando venta:', sale._id);

                if (sale.wallet_amount && sale.wallet_amount > 0) {
                    try {
                        const wallet = await models.Wallet.findOne({ user: sale.user._id });
                        if (wallet) {
                            wallet.balance += sale.wallet_amount;
                            wallet.transactions.push({
                                type: 'refund',
                                amount: sale.wallet_amount,
                                description: `Devolución por venta rechazada: ${sale.n_transaccion || sale._id}`,
                                date: new Date(),
                                metadata: { orderId: sale._id, reason: 'Venta anulada por administrador' }
                            });
                            await wallet.save();
                            console.log(`✅ [RECHAZO] Billetera reacreditada: ${sale.wallet_amount}`);
                        }
                    } catch (walletError) {
                        console.error('❌ [RECHAZO] Error reacreditando billetera:', walletError.message);
                    }
                }

                if (oldStatus === 'Pagado') {
                    for (const item of sale.detail) {
                        if (item.product_type === 'course') {
                            await models.CourseStudent.deleteMany({ user: sale.user._id, course: item.product }).catch(console.error);
                        }
                    }
                }

                await models.InstructorEarnings.updateMany(
                    { sale: sale._id, status: { $in: ['pending', 'available'] } },
                    { $set: { status: 'cancelled', cancelled_at: new Date() } }
                ).catch(console.error);

                await InstructorRetention.updateMany({ sale: sale._id }, { $set: { status: 'cancelled' } }).catch(console.error);
                await PlatformCommissionBreakdown.deleteMany({ sale: sale._id }).catch(console.error);

                console.log('✅ [RECHAZO] Proceso de anulación completado');
            }

            // ── APROBAR ──────────────────────────────────────────────────────────
            if (oldStatus !== 'Pagado' && status === 'Pagado') {
                console.log('🚀 [APROBACIÓN] Activando acceso para venta:', sale._id);
                processPaidSale(sale, sale.user._id).catch(err => {
                    console.error('⚠️ [update_status_sale] Error en processPaidSale (no crítico):', err.message);
                });
                notifyPaymentApproved(sale).catch(console.error);
            }

            sale.status = status;
            if (admin_notes) sale.admin_notes = admin_notes;
            await sale.save();

            emitSaleStatusUpdate(sale);

            res.status(200).json({
                message: status === 'Anulado' ? '❌ Venta anulada y saldo devuelto' : '✅ Estado actualizado',
                sale
            });

        } catch (error) {
            console.error('❌ Error en update_status_sale:', error);
            res.status(500).json({ message: 'Error al actualizar estado' });
        }
    },

    my_transactions: async (req, res) => {
        try {
            let sales = await models.Sale.find({ user: req.user._id })
                .populate({ path: 'detail.product', select: 'title imagen' })
                .sort({ createdAt: -1 });

            for (let sale of sales) {
                if (sale.status === 'Pendiente' &&
                    (sale.method_payment === 'stripe' || sale.method_payment === 'mixed_stripe') &&
                    sale.stripe_session_id) {
                    try {
                        const session = await stripeService.checkout.sessions.retrieve(sale.stripe_session_id);
                        if (session && session.payment_status === 'paid') {
                            console.log(`✅ [my_transactions] Auto-aprobando venta Stripe ${sale._id}`);
                            sale.status = 'Pagado';
                            sale.n_transaccion = session.payment_intent || sale.n_transaccion;
                            await sale.save();
                            // 🔒 Recargar sin populate para que detail.product sea ObjectId puro
                            const saleClean = await reloadSaleClean(sale._id);
                            processPaidSale(saleClean, saleClean.user).catch(console.error);
                            telegramService.notifyPaymentApproved(sale).catch(console.error);
                            socketService.emitSaleStatusUpdate(sale);
                        }
                    } catch (verifyError) {
                        console.error(`❌ [my_transactions] Error auto-verificando Stripe:`, verifyError.message);
                    }
                }
            }

            sales = sales.map(s => typeof s.toObject === 'function' ? s.toObject() : s);

            const saleIds = sales.map(s => s._id);

            const paidEarnings = await models.InstructorEarnings.find({ sale: { $in: saleIds }, status: 'paid' }).select('sale').lean();
            const paidRetentions = await models.InstructorRetention.find({ sale: { $in: saleIds }, status: { $in: ['paid', 'declared'] } }).select('sale').lean();

            const paidSaleIds = new Set([
                ...paidEarnings.map(e => e.sale.toString()),
                ...paidRetentions.map(r => r.sale.toString())
            ]);

            const refunds = await models.Refund.find({ sale: { $in: saleIds } }).lean();
            const refundMap = new Map();
            refunds.forEach(r => {
                if (!refundMap.has(r.sale.toString())) refundMap.set(r.sale.toString(), []);
                refundMap.get(r.sale.toString()).push(r);
            });

            sales = sales.map(sale => {
                const saleRefunds = refundMap.get(sale._id.toString()) || [];
                return {
                    ...sale,
                    refund: saleRefunds[0] || null,
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

    get_by_id: async (req, res) => {
        try {
            const { id } = req.params;
            const sale = await models.Sale.findOne({ _id: id, user: req.user._id })
                .populate({ path: 'detail.product', select: 'title imagen' });

            if (!sale) return res.status(404).json({ message: 'Venta no encontrada' });

            if (sale.status === 'Pendiente' &&
                (sale.method_payment === 'stripe' || sale.method_payment === 'mixed_stripe') &&
                sale.stripe_session_id) {
                try {
                    const session = await stripeService.checkout.sessions.retrieve(sale.stripe_session_id);
                    if (session && session.payment_status === 'paid') {
                        sale.status = 'Pagado';
                        sale.stripe_payment_intent = session.payment_intent || null;
                        await sale.save();
                        // 🔒 Recargar sin populate para que detail.product sea ObjectId puro
                        const saleClean = await reloadSaleClean(sale._id);
                        processPaidSale(saleClean, saleClean.user).catch(console.error);
                        telegramService.notifyPaymentApproved(sale).catch(console.error);
                        socketService.emitSaleStatusUpdate(sale);
                    }
                } catch (verifyError) {
                    console.error(`❌ [get_by_id] Error auto-verificando Stripe:`, verifyError.message);
                }
            }

            res.status(200).json({ transaction: typeof sale.toObject === 'function' ? sale.toObject() : sale });

        } catch (error) {
            console.error('❌ Error en get_by_id:', error);
            res.status(500).json({ message: 'Error al buscar venta' });
        }
    },

    get_by_transaction: async (req, res) => {
        try {
            const { n_transaccion } = req.params;
            const sale = await models.Sale.findOne({ n_transaccion, user: req.user._id })
                .populate({ path: 'detail.product', select: 'title imagen' });

            if (!sale) return res.status(404).json({ message: 'Transacción no encontrada' });

            if (sale.status === 'Pendiente' &&
                (sale.method_payment === 'stripe' || sale.method_payment === 'mixed_stripe') &&
                sale.stripe_session_id) {
                try {
                    const session = await stripeService.checkout.sessions.retrieve(sale.stripe_session_id);
                    if (session && session.payment_status === 'paid') {
                        sale.status = 'Pagado';
                        sale.n_transaccion = session.payment_intent || sale.n_transaccion;
                        await sale.save();
                        // 🔒 Recargar sin populate para que detail.product sea ObjectId puro
                        const saleClean = await reloadSaleClean(sale._id);
                        processPaidSale(saleClean, saleClean.user).catch(console.error);
                        telegramService.notifyPaymentApproved(sale).catch(console.error);
                        socketService.emitSaleStatusUpdate(sale);
                    }
                } catch (verifyError) {
                    console.error(`❌ [get_by_transaction] Error auto-verificando Stripe:`, verifyError.message);
                }
            }

            res.status(200).json({ transaction: typeof sale.toObject === 'function' ? sale.toObject() : sale });

        } catch (error) {
            console.error('❌ Error en get_by_transaction:', error);
            res.status(500).json({ message: 'Error al buscar transacción' });
        }
    },

    recent_notifications: async (req, res) => {
        try {
            const { limit = 10 } = req.query;
            const sales = await models.Sale.find({})
                .populate('user', 'name surname email')
                .sort({ createdAt: -1 })
                .limit(parseInt(limit))
                .lean();

            res.status(200).json({
                recent_sales: sales.map(s => ({
                    _id: s._id,
                    n_transaccion: s.n_transaccion,
                    total: s.total,
                    status: s.status,
                    createdAt: s.createdAt,
                    user: s.user
                })),
                unread_count: sales.filter(s => s.status === 'Pendiente').length
            });

        } catch (error) {
            console.error('❌ Error en recent_notifications:', error);
            res.status(500).json({ message: 'Error al cargar notificaciones' });
        }
    },

    mark_notifications_read: async (req, res) => {
        res.status(200).json({ success: true });
    },

    process_existing_sales: async (req, res) => {
        try {
            const sales = await models.Sale.find({ status: 'Pagado' });
            let processed = 0, skipped = 0, total = 0;
            const processed_details = [], skipped_details = [];

            for (const sale of sales) {
                for (const item of sale.detail) {
                    total++;
                    try {
                        let instructorId = null;
                        if (item.product_type === 'course') {
                            const course = await models.Course.findById(item.product).select('user title');
                            instructorId = course?.user;
                        } else if (item.product_type === 'project') {
                            const project = await models.Project.findById(item.product).select('user title');
                            instructorId = project?.user;
                        }

                        if (!instructorId) {
                            skipped++;
                            skipped_details.push({ sale: sale.n_transaccion || sale._id, product: item.product, reason: 'Sin instructor' });
                            continue;
                        }

                        const existing = await models.InstructorEarnings.findOne({ sale: sale._id, product_id: item.product });
                        if (existing) { skipped++; continue; }

                        const created = await createEarningForProduct(sale, item);
                        if (created) {
                            processed++;
                            processed_details.push({ sale: sale.n_transaccion || sale._id, product: item.product, title: item.title });
                        } else {
                            skipped++;
                        }
                    } catch (err) {
                        skipped++;
                        skipped_details.push({ sale: sale.n_transaccion || sale._id, product: item.product, error: err.message });
                    }
                }
            }

            res.status(200).json({ success: true, message: 'Procesamiento completado', processed, skipped, total, processed_details, skipped_details });

        } catch (error) {
            console.error('❌ Error en process_existing_sales:', error);
            res.status(500).json({ message: 'Error al procesar ventas existentes', error: error.message });
        }
    },

    fix_referral_earnings: async (req, res) => {
        // 🔧 Endpoint de corrección: recalcula ganancias de ventas con cupón de referido
        // que fueron mal calculadas con 30% en vez de 20%
        try {
            if (req.user.rol !== 'admin') return res.status(403).json({ message: 'No autorizado' });

            const { sale_id } = req.body; // Opcional: corregir solo una venta

            const filter = { is_referral: true, coupon_code: { $ne: null }, status: 'Pagado' };
            if (sale_id) filter._id = sale_id;

            const referralSales = await models.Sale.find(filter);
            console.log(`🔧 [fix_referral_earnings] Ventas referido encontradas: ${referralSales.length}`);

            const settings = await models.PlatformCommissionSettings.findOne();
            const REFERRAL_COMMISSION = 20 / 100; // 0.20 (Fija 80/20)

            const { calculatePaymentSplit } = await import('../utils/commissionCalculator.js');

            let fixed = 0, skipped = 0;
            const details = [];

            for (const sale of referralSales) {
                for (const item of sale.detail) {
                    // Buscar el earning existente
                    const earning = await models.InstructorEarnings.findOne({
                        sale: sale._id,
                        product_id: item.product
                    });

                    if (!earning) { skipped++; continue; }

                    // Si ya está marcado como referido con 20%, saltarlo
                    if (earning.is_referral && Math.abs(earning.platform_commission_rate - REFERRAL_COMMISSION) < 0.001) {
                        console.log(`   ℹ️ Earning ${earning._id} ya tiene comisión 20% correcta`);
                        skipped++;
                        continue;
                    }

                    // Verificar que el cupón aplica a este producto/instructor
                    const coupon = await models.Coupon.findOne({ code: sale.coupon_code.trim().toUpperCase() });
                    if (!coupon) { skipped++; continue; }

                    const instructorMatch = coupon.instructor.toString() === earning.instructor.toString();
                    // 🔒 Normalizar item.product: puede ser ObjectId o objeto populado
                    const rawProduct = item.product;
                    const productIdStr = (rawProduct && typeof rawProduct === 'object' && rawProduct._id)
                        ? rawProduct._id.toString()
                        : rawProduct?.toString();
                    const productMatch = coupon.projects.some(p => p.toString() === productIdStr);

                    if (!instructorMatch || !productMatch) { skipped++; continue; }

                    // Recalcular con 20% de plataforma
                    const isWallet = sale.method_payment === 'wallet';
                    const splitResult = isWallet
                        ? { paypalFee: 0, netAmount: item.price_unit }
                        : calculatePaymentSplit(item.price_unit, 'stripe');

                    const netSale = splitResult.netAmount;
                    const newPlatCommission = parseFloat((netSale * REFERRAL_COMMISSION).toFixed(2));
                    const newInstrEarning = parseFloat((netSale - newPlatCommission).toFixed(2));

                    const oldCommission = earning.platform_commission_amount;
                    const oldEarning = earning.instructor_earning;

                    // Actualizar el earning
                    earning.platform_commission_rate = REFERRAL_COMMISSION;
                    earning.platform_commission_amount = newPlatCommission;
                    earning.instructor_earning = newInstrEarning;
                    earning.instructor_earning_usd = newInstrEarning;
                    earning.is_referral = true;
                    await earning.save();

                    fixed++;
                    details.push({
                        sale_id: sale._id,
                        n_transaccion: sale.n_transaccion,
                        product: item.title,
                        old_commission: oldCommission,
                        new_commission: newPlatCommission,
                        old_earning: oldEarning,
                        new_earning: newInstrEarning
                    });

                    console.log(`   ✅ Corregido earning ${earning._id}: comisión ${(oldCommission)} → ${newPlatCommission} | ganancia ${oldEarning} → ${newInstrEarning}`);
                }
            }

            res.status(200).json({
                success: true,
                message: `Corrección completada: ${fixed} corregidos, ${skipped} omitidos`,
                fixed,
                skipped,
                details
            });

        } catch (error) {
            console.error('❌ Error en fix_referral_earnings:', error);
            res.status(500).json({ message: 'Error al corregir ganancias', error: error.message });
        }
    },

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
            res.status(500).send({ message: 'HUBO UN ERROR' });
        }
    }
};
