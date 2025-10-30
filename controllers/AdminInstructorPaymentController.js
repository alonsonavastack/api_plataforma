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

/**
 * Obtener lista de instructores con ganancias disponibles
 * GET /api/admin/instructors/payments?status=&minAmount=
 */
export const getInstructorsWithEarnings = async (req, res) => {
    try {
        const { status = 'available', minAmount = 0 } = req.query;

        // Obtener todos los instructores que tienen ganancias
        const earningsAggregation = await InstructorEarnings.aggregate([
            {
                $match: status !== 'all' ? { status } : {}
            },
            {
                $group: {
                    _id: '$instructor',
                    totalEarnings: { $sum: '$instructor_earning' },
                    count: { $sum: 1 },
                    oldestEarning: { $min: '$earned_at' },
                    newestEarning: { $max: '$earned_at' }
                }
            },
            {
                $match: {
                    totalEarnings: { $gte: parseFloat(minAmount) }
                }
            },
            {
                $sort: { totalEarnings: -1 }
            }
        ]);

        // Poblar información de instructores
        const instructorsWithEarnings = await Promise.all(
            earningsAggregation.map(async (item) => {
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

        // Construir filtros
        const filters = { instructor: instructorId };

        if (status && status !== 'all') {
            filters.status = status;
        }

        if (startDate || endDate) {
            filters.earned_at = {};
            if (startDate) filters.earned_at.$gte = new Date(startDate);
            if (endDate) filters.earned_at.$lte = new Date(endDate);
        }

        // Obtener earnings
        const earnings = await InstructorEarnings.find(filters)
            .populate('course', 'title imagen')
            .populate('product_id')
            .populate('sale', 'n_transaccion created_at user')
            .sort({ earned_at: -1 });
        
        // Formatear earnings para mostrar curso o proyecto correctamente
        const formattedEarnings = earnings.map(earning => {
            const earningObj = earning.toObject();
            
            // Si tiene product_id (nuevo formato para proyectos)
            if (earningObj.product_id) {
                earningObj.product = earningObj.product_id;
            } 
            // Si tiene course (formato legacy)
            else if (earningObj.course) {
                earningObj.product = earningObj.course;
                earningObj.product_type = 'course';
            }
            
            return earningObj;
        });

        // Calcular totales
        const totals = calculateTotalEarnings(earnings);

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
            status: 'available'
        });

        if (earnings.length !== earnings_ids.length) {
            return res.status(400).json({
                success: false,
                message: 'Algunas ganancias no están disponibles o no pertenecen al instructor'
            });
        }

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

        // Determinar rango de fechas
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                earned_at: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        } else {
            const range = getDateRange(period);
            dateFilter = {
                earned_at: {
                    $gte: range.startDate,
                    $lte: range.endDate
                }
            };
        }

        // Obtener todas las ganancias del período
        const earnings = await InstructorEarnings.find(dateFilter)
            .populate('instructor', 'name email')
            .populate('course', 'title');

        // Calcular estadísticas generales
        const stats = calculateEarningsStatsByStatus(earnings);

        // Agrupar por instructor
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

        // Convertir a array y ordenar
        const instructorStats = Object.values(byInstructor)
            .sort((a, b) => b.totalEarnings - a.totalEarnings)
            .map(item => ({
                ...item,
                totalEarnings: parseFloat(item.totalEarnings.toFixed(2)),
                platformCommission: parseFloat(item.platformCommission.toFixed(2))
            }));

        // Agrupar por mes
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
        console.error('Error al generar reporte:', error);
        res.status(500).json({
            success: false,
            message: 'Error al generar reporte',
            error: error.message
        });
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
            paymentDetails: null
        };

        if (paymentConfig.preferred_payment_method === 'bank_transfer' && paymentConfig.bank_account) {
            // 🔥 Desencriptar datos bancarios completos para admin
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
                return res.status(500).json({
                    success: false,
                    message: 'Error al desencriptar datos bancarios'
                });
            }

            response.paymentDetails = {
                type: 'bank_transfer',
                bank_name: paymentConfig.bank_account.bank_name,
                account_number: accountNumber, // 🔥 Número completo sin asteriscos
                clabe: clabe, // 🔥 CLABE completa sin asteriscos
                account_holder_name: paymentConfig.bank_account.account_holder_name,
                account_type: paymentConfig.bank_account.account_type,
                card_brand: paymentConfig.bank_account.card_brand || '',
                swift_code: paymentConfig.bank_account.swift_code || '',
                verified: paymentConfig.bank_account.verified
            };
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
 * Obtener lista de cuentas bancarias pendientes de verificación
 * GET /api/admin/bank-verifications/pending
 * 
 * 🔥 ACTUALIZADO: Ahora detecta tanto cuentas nuevas como cuentas editadas pendientes
 */
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
    getPendingBankVerifications // 🔔 Notificaciones de cuentas pendientes
};
