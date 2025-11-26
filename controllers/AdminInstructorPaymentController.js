import InstructorPaymentConfig from '../models/InstructorPaymentConfig.js';
import InstructorEarnings from '../models/InstructorEarnings.js';
import InstructorPayment from '../models/InstructorPayment.js';
import PlatformCommissionSettings from '../models/PlatformCommissionSettings.js';
import User from '../models/User.js';
import { decrypt, maskAccountNumber } from '../utils/encryption.js';
import {
    calculateTotalEarnings,
    calculatePaymentAmount,
    calculateEarningsStatsByStatus
} from '../utils/commissionCalculator.js';
import { groupEarningsByMonth, getDateRange } from '../utils/dateHelpers.js';
import { sendPaymentProcessedEmail } from '../utils/emailService.js';
import { notifyPaymentProcessed } from '../services/telegram.service.js';

/**
 * CONTROLADOR PARA ADMINISTRADORES
 * Gestiona pagos a instructores y configuración de comisiones
 */

// ============================================================================
// 🎯 FUNCIONES AUXILIARES PARA FILTRAR EARNINGS CON REFUNDS
// ============================================================================

/**
 * Filtra earnings que tienen refunds completados
 * @param {Array} earnings - Array de earnings populados con sale
 * @returns {Array} Earnings válidos (sin refunds completados)
 */
async function filterEarningsWithRefunds(earnings) {
    const Refund = (await import('../models/Refund.js')).default;

    console.log(`🔍 [filterEarnings] Validando ${earnings.length} earnings...`);

    const validEarnings = [];
    const excludedEarnings = [];

    for (const earning of earnings) {
        // Validar que tenga sale
        if (!earning.sale) {
            console.warn(`⚠️ [filterEarnings] Earning ${earning._id} sin sale`);
            excludedEarnings.push({
                earning_id: earning._id,
                reason: 'sin_sale'
            });
            continue;
        }

        // Obtener product_id (puede ser course o product_id)
        const productId = earning.course?._id || earning.product_id?._id || earning.course || earning.product_id;

        if (!productId) {
            console.warn(`⚠️ [filterEarnings] Earning ${earning._id} sin product_id`);
            excludedEarnings.push({
                earning_id: earning._id,
                reason: 'sin_producto'
            });
            continue;
        }

        // Buscar refund COMPLETADO para este producto específico
        const refund = await Refund.findOne({
            sale: earning.sale._id || earning.sale,
            $or: [
                { 'sale_detail_item.product': productId },
                { course: productId },
                { project: productId }
            ],
            status: { $in: ['approved', 'completed'] }
        });

        if (refund) {
            console.log(`🚫 [filterEarnings] Earning ${earning._id} excluido por refund ${refund._id} (${refund.status})`);
            excludedEarnings.push({
                earning_id: earning._id,
                sale_id: earning.sale._id || earning.sale,
                product_id: productId,
                refund_id: refund._id,
                refund_status: refund.status,
                reason: 'refund_completado'
            });
            continue;
        }

        // Earning válido
        validEarnings.push(earning);
    }

    console.log(`✅ [filterEarnings] Válidos: ${validEarnings.length}, Excluidos: ${excludedEarnings.length}`);

    if (excludedEarnings.length > 0) {
        console.log('📊 [filterEarnings] Desglose de exclusiones:');
        const reasonCounts = {};
        excludedEarnings.forEach(e => {
            reasonCounts[e.reason] = (reasonCounts[e.reason] || 0) + 1;
        });
        Object.entries(reasonCounts).forEach(([reason, count]) => {
            console.log(`   - ${reason}: ${count}`);
        });
    }

    return validEarnings;
}

/**
 * Obtener lista de instructores con ganancias disponibles
 * GET /api/admin/instructors/payments?status=&minAmount=
 */
export const getInstructorsWithEarnings = async (req, res) => {
    try {
        const { status = 'all', minAmount = 0 } = req.query;

        console.log(`🔍 [AdminPayments] Buscando instructores con status='${status}', minAmount=${minAmount}`);

        // Construir filtro de status
        // 🔥 CLAVE: Si status='all', obtener ganancias 'available' Y 'pending' (listos para pagar)
        let statusFilter = {};
        if (status && status.toLowerCase() !== 'all') {
            // Si se especifica un estado, usarlo
            statusFilter = { status };
        } else {
            // Si es 'all' o no se especifica, incluir todos los estados que no han sido pagados ni reembolsados.
            statusFilter = { status: { $nin: ['paid', 'completed', 'refunded'] } };
        }

        console.log('📊 [AdminPayments] Filtro de status:', statusFilter);

        // 🔥 PASO 1: Obtener earnings con populate de sale
        const allEarnings = await InstructorEarnings.find(statusFilter)
            .populate('course')
            .populate('product_id')
            .populate('sale'); // 🔥 CRÍTICO: Popular sale para verificar refunds

        console.log(`📦 [AdminPayments] Earnings obtenidos: ${allEarnings.length}`);

        // 🔥 PASO 2: Filtrar earnings con refunds completados
        const validEarnings = await filterEarningsWithRefunds(allEarnings);

        console.log(`✅ [AdminPayments] Ganancias válidas después de filtrar refunds: ${validEarnings.length}`);

        // 🔥 PASO 3: Agrupar por instructor
        const earningsAggregation = validEarnings.reduce((acc, earning) => {
            const instructorId = earning.instructor.toString();

            if (!acc[instructorId]) {
                acc[instructorId] = {
                    _id: earning.instructor,
                    totalEarnings: 0,
                    count: 0,
                    oldestEarning: earning.earned_at,
                    newestEarning: earning.earned_at
                };
            }

            acc[instructorId].totalEarnings += earning.instructor_earning;
            acc[instructorId].count++;

            if (earning.earned_at < acc[instructorId].oldestEarning) {
                acc[instructorId].oldestEarning = earning.earned_at;
            }
            if (earning.earned_at > acc[instructorId].newestEarning) {
                acc[instructorId].newestEarning = earning.earned_at;
            }

            return acc;
        }, {});

        // Convertir a array y filtrar por minAmount
        const earningsArray = Object.values(earningsAggregation)
            .filter(item => {
                // 🔥 CORRECCIÓN: Aplicar filtro de monto mínimo solo si es > 0
                return parseFloat(minAmount) > 0 ? item.totalEarnings >= parseFloat(minAmount) : true;
            })
            .sort((a, b) => b.totalEarnings - a.totalEarnings);

        console.log(`✅ [AdminPayments] Encontrados ${earningsArray.length} instructores con ganancias >= ${minAmount}`);

        // 🔥 PASO 5: Logs detallados por instructor
        console.log(`📊 [AdminPayments] Desglose por instructor:`);
        for (const item of earningsArray) {
            const instructorEarnings = validEarnings.filter(
                e => e.instructor.toString() === item._id.toString()
            );

            const statusCounts = {};
            const statusTotals = {};
            instructorEarnings.forEach(e => {
                statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
                statusTotals[e.status] = (statusTotals[e.status] || 0) + e.instructor_earning;
            });

            console.log(`   • Instructor ${item._id}:`);
            console.log(`     - Total: ${item.totalEarnings.toFixed(2)} USD`);
            console.log(`     - Items: ${item.count}`);
            console.log(`     - Estados:`);
            Object.keys(statusCounts).forEach(status => {
                console.log(`       * ${status}: ${statusCounts[status]} items, ${statusTotals[status].toFixed(2)} USD`);
            });
        }



        // Poblar información de instructores
        const instructorsWithEarnings = await Promise.all(
            earningsArray.map(async (item) => {
                const instructor = await User.findById(item._id).select('name email surname avatar');

                // Obtener configuración de pago
                const paymentConfig = await InstructorPaymentConfig.findOne({
                    instructor: item._id
                }).select('preferred_payment_method paypal_connected bank_account.verified');

                return {
                    instructor,
                    earnings: {
                        total: parseFloat(item.totalEarnings.toFixed(2)),
                        count: item.count,
                        oldestDate: item.oldestEarning,
                        newestDate: item.newestEarning
                    },
                    paymentConfig: {
                        hasConfig: !!paymentConfig,
                        preferredMethod: paymentConfig?.preferred_payment_method || 'none',
                        paypalConnected: paymentConfig?.paypal_connected || false,
                        bankVerified: paymentConfig?.bank_account?.verified || false
                    }
                };
            })
        );

        res.json({
            success: true,
            instructors: instructorsWithEarnings,
            summary: {
                totalInstructors: instructorsWithEarnings.length,
                totalEarnings: instructorsWithEarnings.reduce((sum, i) => sum + i.earnings.total, 0).toFixed(2)
            }
        });
    } catch (error) {
        console.error('Error al obtener instructores con ganancias:', error);
        console.error(error.stack);
        res.status(500).json({
            success: false,
            message: 'Error al obtener instructores con ganancias',
            error: error.message,
            stack: error.stack
        });
    }
};

/**
 * Obtener ganancias detalladas de un instructor
 * GET /api/admin/instructors/:id/earnings?status=&startDate=&endDate=
 */
export const getInstructorEarnings = async (req, res) => {
    try {
        const { id: instructorId } = req.params;
        const { status, startDate, endDate } = req.query;

        console.log(`\ud83d\udd0d [getInstructorEarnings] Instructor: ${instructorId}, status: ${status || 'all'}`);

        // Construir filtros
        const filters = {
            instructor: instructorId
        };

        if (status && status !== 'all') {
            filters.status = status;
        } else {
            // Si es 'all' o no se especifica, usar el mismo filtro robusto que la lista general
            filters.status = { $nin: ['paid', 'completed', 'refunded'] };
        }

        if (startDate || endDate) {
            filters.earned_at = {};
            if (startDate) filters.earned_at.$gte = new Date(startDate);
            if (endDate) filters.earned_at.$lte = new Date(endDate);
        }

        console.log(`\ud83d\udd0d [getInstructorEarnings] Buscando earnings con filtros:`, filters);

        // \ud83d\udd25 PASO 1: Obtener earnings con populate de sale
        const allEarnings = await InstructorEarnings.find(filters)
            .populate('course', 'title imagen')
            .populate('product_id', 'title imagen')
            .populate('sale', 'n_transaccion created_at user')
            .sort({ earned_at: -1 });

        console.log(`\ud83d\udce6 [getInstructorEarnings] Earnings obtenidos: ${allEarnings.length}`);

        // \ud83d\udd25 PASO 2: Filtrar earnings con refunds completados
        const validEarnings = await filterEarningsWithRefunds(allEarnings);

        console.log(`\u2705 [getInstructorEarnings] Ganancias válidas después de filtrar refunds: ${validEarnings.length}`);

        console.log(`\ud83d\udcca [getInstructorEarnings] Desglose por estado:`);
        const countByStatus = {};
        validEarnings.forEach(e => {
            countByStatus[e.status] = (countByStatus[e.status] || 0) + 1;
        });
        console.log(`   Estados:`, countByStatus);

        // Formatear earnings para mostrar curso o proyecto correctamente
        const formattedEarnings = validEarnings.map(earning => {
            const earningObj = earning.toObject();

            // Si tiene product_id (nuevo formato para proyectos)
            if (earningObj.product_id) {
                earningObj.product = earningObj.product_id;
                earningObj.product_type = 'project';
            }
            // Si tiene course (formato legacy)
            else if (earningObj.course) {
                earningObj.product = earningObj.course;
                earningObj.product_type = 'course';
            }

            return earningObj;
        });

        // Calcular totales
        const totals = calculateTotalEarnings(validEarnings);

        // Obtener configuración del instructor
        const instructor = await User.findById(instructorId).select('name email surname');
        const paymentConfig = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        res.json({
            success: true,
            instructor,
            earnings: formattedEarnings,
            totals,
            paymentConfig
        });
    } catch (error) {
        console.error('Error al obtener ganancias del instructor:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener ganancias del instructor',
            error: error.message
        });
    }
};

/**
 * Crear un nuevo pago para un instructor
 * POST /api/admin/instructors/:id/payment
 * Body: { earnings_ids: [], deductions: 0, notes: '' }
 */
export const createPayment = async (req, res) => {
    try {
        const { id: instructorId } = req.params;
        const adminId = req.user._id;
        const { earnings_ids, deductions = 0, notes = '' } = req.body;

        // Validaciones
        if (!earnings_ids || !Array.isArray(earnings_ids) || earnings_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Debe seleccionar al menos una ganancia'
            });
        }

        // Verificar que todas las ganancias existan y sean del instructor
        const earnings = await InstructorEarnings.find({
            _id: { $in: earnings_ids },
            instructor: instructorId,
            status: { $in: ['available', 'pending'] } // 🔥 CORRECCIÓN: Permitir pagar ganancias pendientes y disponibles
        });

        if (earnings.length !== earnings_ids.length) {
            return res.status(400).json({
                success: false,
                message: 'Algunas ganancias no están disponibles o no pertenecen al instructor'
            });
        }

        // 🔥 VALIDACIÓN ADICIONAL: Verificar reembolsos
        console.log('🔒 [createPayment] Verificando reembolsos...');

        const Refund = (await import('../models/Refund.js')).default;
        const earningsWithRefund = [];
        const validEarnings = [];

        for (const earning of earnings) {
            // 🔥 CORRECCIÓN: Verificar si existe un reembolso para el PRODUCTO ESPECÍFICO de esta ganancia.
            // No basta con que la venta tenga "algún" reembolso.
            const productId = earning.course?._id || earning.product_id?._id;
            if (!productId) {
                validEarnings.push(earning); // Si no hay producto, no puede haber reembolso específico.
                continue;
            }

            const refund = await Refund.findOne({
                sale: earning.sale,
                'sale_detail_item.product': productId,
                status: 'completed' // Solo reembolsos completados
            });

            if (refund) {
                earningsWithRefund.push({
                    earning_id: earning._id,
                    sale_id: earning.sale,
                    refund_id: refund?._id,
                    status: earning.status
                });
            } else {
                validEarnings.push(earning);
            }
        }

        if (earningsWithRefund.length > 0) {
            console.log('❌ [createPayment] Ganancias con reembolso detectadas:', earningsWithRefund.length);

            return res.status(400).json({
                success: false,
                message: 'Algunas ganancias seleccionadas tienen reembolsos completados',
                earnings_with_refund: earningsWithRefund,
                valid_earnings: validEarnings.map(e => e._id)
            });
        }

        console.log('✅ [createPayment] Todas las ganancias son válidas');

        // Calcular totales
        const totalEarnings = earnings.reduce((sum, e) => sum + e.instructor_earning, 0);
        const paymentCalc = calculatePaymentAmount(totalEarnings, deductions);

        // Obtener configuración de pago del instructor
        const paymentConfig = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        if (!paymentConfig || !paymentConfig.preferred_payment_method) {
            return res.status(400).json({
                success: false,
                message: 'El instructor no ha configurado un método de pago'
            });
        }

        // Preparar detalles del pago según el método
        const paymentDetails = {};

        if (paymentConfig.preferred_payment_method === 'paypal') {
            paymentDetails.paypal_email = paymentConfig.paypal_email;
        } else if (paymentConfig.preferred_payment_method === 'bank_transfer') {
            // 🔥 VALIDACIÓN: Verificar que la cuenta esté aprobada
            if (!paymentConfig.bank_account || !paymentConfig.bank_account.verified) {
                return res.status(400).json({
                    success: false,
                    message: 'La cuenta bancaria del instructor no ha sido verificada por un administrador. Por favor verifique la cuenta en la sección "Verificar Bancos" antes de procesar el pago.'
                });
            }

            const accountNumber = paymentConfig.bank_account?.account_number
                ? decrypt(paymentConfig.bank_account.account_number)
                : '';
            paymentDetails.bank_account_number = maskAccountNumber(accountNumber);
            paymentDetails.bank_name = paymentConfig.bank_account?.bank_name || '';
        }

        // Crear el pago
        const payment = await InstructorPayment.create({
            instructor: instructorId,
            total_earnings: totalEarnings,
            amount_to_pay: totalEarnings,
            platform_deductions: deductions,
            final_amount: paymentCalc.finalAmount,
            currency: earnings[0].currency || 'USD',
            payment_method: paymentConfig.preferred_payment_method,
            payment_details: paymentDetails,
            earnings_included: earnings_ids,
            status: 'pending',
            created_by: adminId,
            admin_notes: notes
        });

        // Actualizar estado de las ganancias a 'paid'
        await InstructorEarnings.updateMany(
            { _id: { $in: earnings_ids } },
            {
                status: 'paid',
                payment_reference: payment._id,
                paid_at: new Date()
            }
        );

        // Poblar información para la respuesta
        const populatedPayment = await InstructorPayment.findById(payment._id)
            .populate('instructor', 'name email surname')
            .populate('created_by', 'name email');

        res.json({
            success: true,
            message: 'Pago creado exitosamente',
            payment: populatedPayment
        });
    } catch (error) {
        console.error('Error al crear pago:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear pago',
            error: error.message
        });
    }
};

/**
 * Procesar un pago (marcar como processing)
 * PUT /api/admin/payments/:id/process
 * Body: { transaction_id: '', receipt_url: '' }
 */
export const processPayment = async (req, res) => {
    try {
        const { id: paymentId } = req.params;
        const adminId = req.user._id;
        const { transaction_id, receipt_url } = req.body;

        const payment = await InstructorPayment.findById(paymentId);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Pago no encontrado'
            });
        }

        if (payment.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Solo se pueden procesar pagos pendientes'
            });
        }

        // Actualizar detalles según el método
        if (payment.payment_method === 'paypal' && transaction_id) {
            payment.payment_details.paypal_transaction_id = transaction_id;
        } else if (payment.payment_method === 'bank_transfer') {
            if (transaction_id) payment.payment_details.transfer_reference = transaction_id;
            if (receipt_url) payment.payment_details.transfer_receipt = receipt_url;
        }

        payment.status = 'processing';
        payment.processed_at = new Date();
        payment.processed_by = adminId;

        await payment.save();

        const populatedPayment = await InstructorPayment.findById(payment._id)
            .populate('instructor', 'name email surname')
            .populate('processed_by', 'name email');

        res.json({
            success: true,
            message: 'Pago marcado como en proceso',
            payment: populatedPayment
        });

        // 🔥 NOTIFICACIONES ASÍNCRONAS
        try {
            // 1. Enviar email al instructor
            await sendPaymentProcessedEmail(populatedPayment.instructor, populatedPayment);

            // 2. Enviar notificación a Telegram (Admin)
            await notifyPaymentProcessed(populatedPayment, populatedPayment.instructor);

            console.log('✅ Notificaciones de pago enviadas correctamente');
        } catch (notifyError) {
            console.error('⚠️ Error al enviar notificaciones de pago:', notifyError);
        }
    } catch (error) {
        console.error('Error al procesar pago:', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar pago',
            error: error.message
        });
    }
};

/**
 * Completar un pago (marcar como completed)
 * PUT /api/admin/payments/:id/complete
 */
export const completePayment = async (req, res) => {
    try {
        const { id: paymentId } = req.params;
        const adminId = req.user._id;

        const payment = await InstructorPayment.findById(paymentId);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Pago no encontrado'
            });
        }

        if (payment.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Este pago ya está completado'
            });
        }

        payment.status = 'completed';
        payment.completed_at = new Date();
        if (!payment.processed_by) {
            payment.processed_by = adminId;
        }

        await payment.save();

        const populatedPayment = await InstructorPayment.findById(payment._id)
            .populate('instructor', 'name email surname')
            .populate('processed_by', 'name email');

        res.json({
            success: true,
            message: 'Pago completado exitosamente',
            payment: populatedPayment
        });
    } catch (error) {
        console.error('Error al completar pago:', error);
        res.status(500).json({
            success: false,
            message: 'Error al completar pago',
            error: error.message
        });
    }
};

/**
 * Obtener historial de todos los pagos
 * GET /api/admin/payments?status=&instructor=&page=&limit=
 */
export const getPaymentHistory = async (req, res) => {
    try {
        const {
            status,
            instructor,
            page = 1,
            limit = 20
        } = req.query;

        // Construir filtros
        const filters = {};
        if (status && status !== 'all') filters.status = status;
        if (instructor) filters.instructor = instructor;

        // Paginación
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        // Obtener pagos
        const payments = await InstructorPayment.find(filters)
            .populate('instructor', 'name email surname avatar')
            .populate('created_by', 'name email')
            .populate('processed_by', 'name email')
            .sort({ created_by_admin_at: -1 })
            .skip(skip)
            .limit(limitNum);

        // Contar total
        const total = await InstructorPayment.countDocuments(filters);

        res.json({
            success: true,
            payments,
            pagination: {
                page: parseInt(page),
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Error al obtener historial de pagos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener historial de pagos',
            error: error.message
        });
    }
};

/**
 * Obtener configuración de comisiones
 * GET /api/admin/commission-settings
 */
export const getCommissionSettings = async (req, res) => {
    try {
        const settings = await PlatformCommissionSettings.getSettings();

        // Poblar información de instructores con comisiones personalizadas
        if (settings.instructor_custom_rates.length > 0) {
            await settings.populate('instructor_custom_rates.instructor', 'name email surname');
            await settings.populate('instructor_custom_rates.created_by', 'name email');
        }

        res.json({
            success: true,
            settings
        });
    } catch (error) {
        console.error('Error al obtener configuración de comisiones:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener configuración de comisiones',
            error: error.message
        });
    }
};

/**
 * Actualizar configuración global de comisiones
 * PUT /api/admin/commission-settings
 * Body: { default_commission_rate, days_until_available, minimum_payment_threshold, exchange_rate }
 */
export const updateCommissionSettings = async (req, res) => {
    try {
        const adminId = req.user._id;
        const {
            default_commission_rate,
            days_until_available,
            minimum_payment_threshold,
            exchange_rate_usd_to_mxn
        } = req.body;

        const settings = await PlatformCommissionSettings.getSettings();

        // Actualizar solo los campos proporcionados
        if (default_commission_rate !== undefined) {
            settings.default_commission_rate = default_commission_rate;
        }
        if (days_until_available !== undefined) {
            settings.days_until_available = days_until_available;
        }
        if (minimum_payment_threshold !== undefined) {
            settings.minimum_payment_threshold = minimum_payment_threshold;
        }
        if (exchange_rate_usd_to_mxn !== undefined) {
            settings.exchange_rate_usd_to_mxn = exchange_rate_usd_to_mxn;
        }

        settings.last_updated_by = adminId;
        await settings.save();

        res.json({
            success: true,
            message: 'Configuración de comisiones actualizada',
            settings
        });
    } catch (error) {
        console.error('Error al actualizar configuración:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar configuración',
            error: error.message
        });
    }
};

/**
 * Establecer comisión personalizada para un instructor
 * POST /api/admin/commission-settings/custom
 * Body: { instructor_id, commission_rate, reason }
 */
export const setCustomCommission = async (req, res) => {
    try {
        const adminId = req.user._id;
        const { instructor_id, commission_rate, reason } = req.body;

        // Validaciones
        if (!instructor_id || !commission_rate) {
            return res.status(400).json({
                success: false,
                message: 'instructor_id y commission_rate son requeridos'
            });
        }

        if (commission_rate < 0 || commission_rate > 100) {
            return res.status(400).json({
                success: false,
                message: 'La comisión debe estar entre 0 y 100'
            });
        }

        // Verificar que el instructor existe
        const instructor = await User.findById(instructor_id);
        if (!instructor) {
            return res.status(404).json({
                success: false,
                message: 'Instructor no encontrado'
            });
        }

        // Establecer comisión personalizada
        const settings = await PlatformCommissionSettings.setCustomCommission(
            instructor_id,
            commission_rate,
            reason || '',
            adminId
        );

        await settings.populate('instructor_custom_rates.instructor', 'name email surname');

        res.json({
            success: true,
            message: 'Comisión personalizada establecida',
            settings
        });
    } catch (error) {
        console.error('Error al establecer comisión personalizada:', error);
        res.status(500).json({
            success: false,
            message: 'Error al establecer comisión personalizada',
            error: error.message
        });
    }
};

/**
 * Eliminar comisión personalizada de un instructor
 * DELETE /api/admin/commission-settings/custom/:instructorId
 */
export const removeCustomCommission = async (req, res) => {
    try {
        const adminId = req.user._id;
        const { instructorId } = req.params;

        const settings = await PlatformCommissionSettings.removeCustomCommission(
            instructorId,
            adminId
        );

        res.json({
            success: true,
            message: 'Comisión personalizada eliminada',
            settings
        });
    } catch (error) {
        console.error('Error al eliminar comisión personalizada:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar comisión personalizada',
            error: error.message
        });
    }
};

/**
 * Obtener reporte de ganancias y comisiones
 * GET /api/admin/earnings/report?period=&startDate=&endDate=
 */
export const getEarningsReport = async (req, res) => {
    try {
        const { period = 'month', startDate, endDate } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                earned_at: { $gte: new Date(startDate), $lte: new Date(endDate) }
            };
        } else {
            const range = getDateRange(period);
            dateFilter = {
                earned_at: { $gte: range.startDate, $lte: range.endDate }
            };
        }

        const earnings = await InstructorEarnings.find(dateFilter)
            .populate('instructor', 'name email')
            .populate('course', 'title');

        const stats = calculateEarningsStatsByStatus(earnings);

        const byInstructor = {};
        earnings.forEach(earning => {
            const instructorId = earning.instructor._id.toString();
            if (!byInstructor[instructorId]) {
                byInstructor[instructorId] = {
                    instructor: earning.instructor,
                    totalEarnings: 0,
                    platformCommission: 0,
                    count: 0
                };
            }
            byInstructor[instructorId].totalEarnings += earning.instructor_earning;
            byInstructor[instructorId].platformCommission += earning.platform_commission_amount;
            byInstructor[instructorId].count++;
        });

        const instructorStats = Object.values(byInstructor)
            .sort((a, b) => b.totalEarnings - a.totalEarnings)
            .map(item => ({
                ...item,
                totalEarnings: parseFloat(item.totalEarnings.toFixed(2)),
                platformCommission: parseFloat(item.platformCommission.toFixed(2))
            }));

        const byMonth = groupEarningsByMonth(earnings);

        res.json({
            success: true,
            report: {
                period: {
                    type: period,
                    startDate: dateFilter.earned_at.$gte,
                    endDate: dateFilter.earned_at.$lte
                },
                summary: stats,
                byInstructor: instructorStats,
                byMonth
            }
        });
    } catch (error) {
        console.error('❌ Error al generar reporte:', error);
        res.status(500).json({ success: false, message: 'Error al generar reporte', error: error.message });
    }
};



/**
 * 🔥 NUEVO: Obtener datos bancarios completos de un instructor (solo para admin)
 * GET /api/admin/instructors/:id/payment-method-full
 * Este endpoint devuelve los datos bancarios SIN encriptar para que el admin pueda procesarlos
 */
export const getInstructorPaymentMethodFull = async (req, res) => {
    try {
        const { id: instructorId } = req.params;

        // Verificar que el instructor existe
        const instructor = await User.findById(instructorId).select('name email surname');
        if (!instructor) {
            return res.status(404).json({
                success: false,
                message: 'Instructor no encontrado'
            });
        }

        // Obtener configuración de pago
        const paymentConfig = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        // 🔥 Si no tiene configuración, retornar estructura vacía en lugar de error 404
        if (!paymentConfig) {
            return res.json({
                success: true,
                data: {
                    instructor,
                    paymentMethod: null,
                    preferredMethod: 'none',
                    paymentDetails: null,
                    hasConfig: false,
                    message: 'El instructor aún no ha configurado su método de pago'
                }
            });
        }

        // Preparar respuesta con datos COMPLETOS (desencriptados)
        const response = {
            instructor,
            paymentMethod: paymentConfig.preferred_payment_method,
            preferredMethod: paymentConfig.preferred_payment_method,
            paymentDetails: null,
            bankDetails: null // 🔥 Nuevo campo: Siempre devolver detalles bancarios si existen
        };

        // 🔥 SIEMPRE intentar poblar bankDetails si existen datos, independientemente del método preferido
        if (paymentConfig.bank_account && (paymentConfig.bank_account.account_number || paymentConfig.bank_account.clabe)) {
            let accountNumber = '';
            let clabe = '';

            try {
                if (paymentConfig.bank_account.account_number) {
                    accountNumber = decrypt(paymentConfig.bank_account.account_number);
                }
                if (paymentConfig.bank_account.clabe) {
                    clabe = decrypt(paymentConfig.bank_account.clabe);
                }
            } catch (decryptError) {
                console.error('Error al desencriptar:', decryptError);
                // No fallar todo el request, solo dejar vacío
            }

            response.bankDetails = {
                type: 'bank_transfer',
                bank_name: paymentConfig.bank_account.bank_name,
                account_number: accountNumber,
                clabe: clabe,
                account_holder_name: paymentConfig.bank_account.account_holder_name,
                account_type: paymentConfig.bank_account.account_type,
                card_brand: paymentConfig.bank_account.card_brand || '',
                swift_code: paymentConfig.bank_account.swift_code || '',
                verified: paymentConfig.bank_account.verified
            };
        }

        // Poblar paymentDetails según el método PREFERIDO (comportamiento original)
        if (paymentConfig.preferred_payment_method === 'bank_transfer' && response.bankDetails) {
            response.paymentDetails = response.bankDetails;
        } else if (paymentConfig.preferred_payment_method === 'paypal') {
            response.paymentDetails = {
                type: 'paypal',
                paypal_email: paymentConfig.paypal_email, // Email completo
                paypal_merchant_id: paymentConfig.paypal_merchant_id || '',
                paypal_connected: paymentConfig.paypal_connected,
                paypal_verified: paymentConfig.paypal_verified
            };
        }

        res.json({
            success: true,
            data: response
        });
    } catch (error) {
        console.error('Error al obtener método de pago completo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener método de pago',
            error: error.message
        });
    }
};

/**
 * Verificar cuenta bancaria de un instructor
 * PUT /api/admin/instructors/:id/verify-bank
 */
export const verifyInstructorBank = async (req, res) => {
    try {
        const { id: instructorId } = req.params;

        const instructor = await User.findById(instructorId).select('name email surname');
        if (!instructor) {
            return res.status(404).json({
                success: false,
                message: 'Instructor no encontrado'
            });
        }

        const paymentConfig = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        if (!paymentConfig) {
            return res.status(404).json({
                success: false,
                message: 'El instructor no tiene configuración de pago'
            });
        }

        if (!paymentConfig.bank_account) {
            return res.status(400).json({
                success: false,
                message: 'El instructor no tiene cuenta bancaria configurada'
            });
        }

        // Verificar la cuenta bancaria
        paymentConfig.bank_account.verified = true;
        await paymentConfig.save();

        res.json({
            success: true,
            message: 'Cuenta bancaria verificada exitosamente'
        });
    } catch (error) {
        console.error('Error al verificar cuenta bancaria:', error);
        res.status(500).json({
            success: false,
            message: 'Error al verificar cuenta bancaria',
            error: error.message
        });
    }
};

/**
 * Obtener todos los instructores con cuenta bancaria configurada (Verificada o No)
 * GET /api/admin/bank-accounts/all
 */
export const getAllBankAccounts = async (req, res) => {
    try {
        // Buscar configuraciones que tengan datos bancarios
        const configs = await InstructorPaymentConfig.find({
            $or: [
                { 'bank_account.account_number': { $exists: true, $ne: '', $ne: null } },
                { 'bank_account.clabe': { $exists: true, $ne: '', $ne: null } }
            ]
        })
            .populate('instructor', 'name email surname avatar')
            .sort({ updatedAt: -1 });

        console.log(`📋 [getAllBankAccounts] Encontradas ${configs.length} cuentas bancarias`);

        // Mapear para devolver formato consistente con lo que espera el frontend
        // El frontend espera un array de objetos que tengan una propiedad 'instructor' o sean el instructor mismo
        const instructors = configs.map(config => ({
            _id: config.instructor._id,
            instructor: config.instructor,
            // Enviamos metadatos útiles por si se quieren usar en la lista antes de cargar detalles
            hasBankAccount: true,
            isVerified: config.bank_account?.verified || false,
            updatedAt: config.updatedAt
        }));

        res.json({
            success: true,
            instructors
        });
    } catch (error) {
        console.error('Error al obtener cuentas bancarias:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener cuentas bancarias',
            error: error.message
        });
    }
};

export const getPendingBankVerifications = async (req, res) => {
    try {
        // Buscar todas las configuraciones de pago con cuentas bancarias NO verificadas
        // Incluye:
        // 1. Cuentas nuevas (verified: false)
        // 2. Cuentas editadas (verified cambió a false)
        const pendingConfigs = await InstructorPaymentConfig.find({
            $and: [
                { 'bank_account.verified': false }, // NO verificadas
                {
                    $or: [
                        { 'bank_account.account_number': { $exists: true, $ne: '', $ne: null } },
                        { 'bank_account.clabe': { $exists: true, $ne: '', $ne: null } }
                    ]
                }
            ]
        })
            .populate('instructor', 'name email surname avatar')
            .sort({ updatedAt: -1 });

        console.log(`🔔 [BankVerifications] Encontradas ${pendingConfigs.length} cuentas pendientes de verificación`);

        // Formatear respuesta
        const notifications = pendingConfigs.map(config => {
            const notification = {
                _id: config._id,
                instructor: config.instructor,
                bankDetails: {
                    bank_name: config.bank_account?.bank_name || 'No especificado',
                    account_type: config.bank_account?.account_type || 'No especificado',
                    verified: config.bank_account?.verified || false
                },
                updatedAt: config.updatedAt,
                createdAt: config.createdAt,
                // 🔥 Detectar si es una edición reciente (menos de 1 hora)
                isRecentEdit: config.updatedAt && (Date.now() - new Date(config.updatedAt).getTime()) < 3600000
            };

            console.log(`  - ${config.instructor.name} ${config.instructor.surname}: ${config.bank_account?.bank_name} (${notification.isRecentEdit ? 'EDITADO RECIENTEMENTE' : 'Pendiente'})`);

            return notification;
        });

        res.json({
            success: true,
            notifications,
            count: notifications.length
        });
    } catch (error) {
        console.error('Error al obtener verificaciones pendientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener verificaciones pendientes',
            error: error.message
        });
    }
};

export default {
    getInstructorsWithEarnings,
    getInstructorEarnings,
    createPayment,
    processPayment,
    completePayment,
    getPaymentHistory,
    getCommissionSettings,
    updateCommissionSettings,
    setCustomCommission,
    removeCustomCommission,
    getEarningsReport,
    getInstructorPaymentMethodFull, // 🔥 Nuevo endpoint
    verifyInstructorBank, // 🔥 Nuevo endpoint de verificación
    getPendingBankVerifications, // 🔔 Notificaciones de cuentas pendientes
    getAllBankAccounts // 🔥 Nuevo endpoint para lista completa
};
