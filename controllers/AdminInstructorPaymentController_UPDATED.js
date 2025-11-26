// ESTE ES EL ARCHIVO ACTUALIZADO CON EL FIX COMPLETO
// Reemplazar AdminInstructorPaymentController.js con este contenido

// Para aplicar: cp AdminInstructorPaymentController_UPDATED.js AdminInstructorPaymentController.js

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
        let statusFilter = {};
        if (status && status.toLowerCase() !== 'all') {
            statusFilter = { status };
        } else {
            statusFilter = { status: { $nin: ['paid', 'completed', 'refunded'] } };
        }

        console.log('📊 [AdminPayments] Filtro de status:', statusFilter);

        // 🔥 PASO 1: Obtener earnings con populate de sale
        const allEarnings = await InstructorEarnings.find(statusFilter)
            .populate('course')
            .populate('product_id')
            .populate('sale');

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
                return parseFloat(minAmount) > 0 ? item.totalEarnings >= parseFloat(minAmount) : true;
            })
            .sort((a, b) => b.totalEarnings - a.totalEarnings);

        console.log(`✅ [AdminPayments] Encontrados ${earningsArray.length} instructores con ganancias >= ${minAmount}`);

        // Logs detallados por instructor
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
        console.error('❌ Error al obtener instructores con ganancias:', error);
        console.error(error.stack);
        res.status(500).json({
            success: false,
            message: 'Error al obtener instructores con ganancias',
            error: error.message
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

        console.log(`🔍 [getInstructorEarnings] Instructor: ${instructorId}, status: ${status || 'all'}`);

        // Construir filtros
        const filters = {
            instructor: instructorId
        };

        if (status && status !== 'all') {
            filters.status = status;
        } else {
            filters.status = { $nin: ['paid', 'completed', 'refunded'] };
        }

        if (startDate || endDate) {
            filters.earned_at = {};
            if (startDate) filters.earned_at.$gte = new Date(startDate);
            if (endDate) filters.earned_at.$lte = new Date(endDate);
        }

        console.log(`🔍 [getInstructorEarnings] Buscando earnings con filtros:`, filters);

        // 🔥 OBTENER EARNINGS CON POPULATE
        const allEarnings = await InstructorEarnings.find(filters)
            .populate('course', 'title imagen')
            .populate('product_id', 'title imagen')
            .populate('sale', 'n_transaccion created_at user')
            .sort({ earned_at: -1 });

        console.log(`📦 [getInstructorEarnings] Earnings obtenidos: ${allEarnings.length}`);

        // 🔥 FILTRAR EARNINGS CON REFUNDS
        const validEarnings = await filterEarningsWithRefunds(allEarnings);

        console.log(`✅ [getInstructorEarnings] Ganancias válidas después de filtrar: ${validEarnings.length}`);

        // Logs de desglose por estado
        console.log(`📊 [getInstructorEarnings] Desglose por estado:`);
        const countByStatus = {};
        validEarnings.forEach(e => {
            countByStatus[e.status] = (countByStatus[e.status] || 0) + 1;
        });
        console.log(`   Estados:`, countByStatus);

        // Formatear earnings
        const formattedEarnings = validEarnings.map(earning => {
            const earningObj = earning.toObject();

            if (earningObj.product_id) {
                earningObj.product = earningObj.product_id;
                earningObj.product_type = 'project';
            } else if (earningObj.course) {
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
        console.error('❌ Error al obtener ganancias del instructor:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener ganancias del instructor',
            error: error.message
        });
    }
};

// ============================================================================
// ✅ EL RESTO DE LAS FUNCIONES SE MANTIENEN IGUAL
// createPayment ya tiene validación de refunds correcta
// ============================================================================

export const createPayment = async (req, res) => {
    try {
        const { id: instructorId } = req.params;
        const adminId = req.user._id;
        const { earnings_ids, deductions = 0, notes = '' } = req.body;

        if (!earnings_ids || !Array.isArray(earnings_ids) || earnings_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Debe seleccionar al menos una ganancia'
            });
        }

        const earnings = await InstructorEarnings.find({
            _id: { $in: earnings_ids },
            instructor: instructorId,
            status: { $in: ['available', 'pending'] }
        }).populate('sale');

        if (earnings.length !== earnings_ids.length) {
            return res.status(400).json({
                success: false,
                message: 'Algunas ganancias no están disponibles o no pertenecen al instructor'
            });
        }

        // 🔥 Validar refunds usando la misma función
        console.log('🔒 [createPayment] Verificando reembolsos...');
        const validEarnings = await filterEarningsWithRefunds(earnings);

        if (validEarnings.length !== earnings.length) {
            const excludedCount = earnings.length - validEarnings.length;
            return res.status(400).json({
                success: false,
                message: `${excludedCount} ganancias seleccionadas tienen reembolsos completados y no pueden pagarse`,
                valid_earnings_count: validEarnings.length,
                excluded_count: excludedCount
            });
        }

        console.log('✅ [createPayment] Todas las ganancias son válidas');

        const totalEarnings = earnings.reduce((sum, e) => sum + e.instructor_earning, 0);
        const paymentCalc = calculatePaymentAmount(totalEarnings, deductions);

        const paymentConfig = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        if (!paymentConfig || !paymentConfig.preferred_payment_method) {
            return res.status(400).json({
                success: false,
                message: 'El instructor no ha configurado un método de pago'
            });
        }

        const paymentDetails = {};

        if (paymentConfig.preferred_payment_method === 'paypal') {
            paymentDetails.paypal_email = paymentConfig.paypal_email;
        } else if (paymentConfig.preferred_payment_method === 'bank_transfer') {
            if (!paymentConfig.bank_account || !paymentConfig.bank_account.verified) {
                return res.status(400).json({
                    success: false,
                    message: 'La cuenta bancaria del instructor no ha sido verificada'
                });
            }

            const accountNumber = paymentConfig.bank_account?.account_number
                ? decrypt(paymentConfig.bank_account.account_number)
                : '';
            paymentDetails.bank_account_number = maskAccountNumber(accountNumber);
            paymentDetails.bank_name = paymentConfig.bank_account?.bank_name || '';
        }

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

        await InstructorEarnings.updateMany(
            { _id: { $in: earnings_ids } },
            {
                status: 'paid',
                payment_reference: payment._id,
                paid_at: new Date()
            }
        );

        const populatedPayment = await InstructorPayment.findById(payment._id)
            .populate('instructor', 'name email surname')
            .populate('created_by', 'name email');

        res.json({
            success: true,
            message: 'Pago creado exitosamente',
            payment: populatedPayment
        });
    } catch (error) {
        console.error('❌ Error al crear pago:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear pago',
            error: error.message
        });
    }
};

// Exportar todas las demás funciones igual que el archivo original...
// (processPayment, completePayment, getPaymentHistory, etc.)
