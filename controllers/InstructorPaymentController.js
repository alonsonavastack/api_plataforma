import InstructorPaymentConfig from '../models/InstructorPaymentConfig.js';
import InstructorEarnings from '../models/InstructorEarnings.js';
import InstructorPayment from '../models/InstructorPayment.js';
import { encrypt, decrypt, maskAccountNumber } from '../utils/encryption.js';
import { calculateEarningsStatsByStatus } from '../utils/commissionCalculator.js';
import { formatDate, formatDateTime, groupEarningsByMonth } from '../utils/dateHelpers.js';

/**
 * CONTROLADOR PARA INSTRUCTORES
 * Gestiona la configuración de pagos y visualización de ganancias del instructor
 */

/**
 * Obtener configuración de pago del instructor
 * GET /api/instructor/payment-config
 */
export const getPaymentConfig = async (req, res) => {
    try {
        const instructorId = req.user._id;

        let config = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        if (!config) {
            // Si no existe, crear una configuración vacía
            config = await InstructorPaymentConfig.create({
                instructor: instructorId
            });
        }

        // Convertir a objeto plano para poder modificar
        const response = config.toObject();

        // Desencriptar datos bancarios si existen
        if (response.bank_account?.account_number && response.bank_account.account_number.trim() !== '') {
            try {
                const decryptedAccountNumber = decrypt(response.bank_account.account_number);
                response.bank_account.account_number_masked = maskAccountNumber(decryptedAccountNumber);
            } catch (err) {
                console.error('Error al desencriptar número de cuenta:', err);
            }
            // No enviar el número completo al frontend
            delete response.bank_account.account_number;
        }

        if (response.bank_account?.clabe && response.bank_account.clabe.trim() !== '') {
            try {
                const decryptedClabe = decrypt(response.bank_account.clabe);
                response.bank_account.clabe_masked = maskAccountNumber(decryptedClabe);
            } catch (err) {
                console.error('Error al desencriptar CLABE:', err);
            }
            delete response.bank_account.clabe;
        }

        res.json({
            success: true,
            config: response
        });
    } catch (error) {
        console.error('Error al obtener configuración de pago:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener configuración de pago',
            error: error.message
        });
    }
};

/**
 * Actualizar/conectar configuración de PayPal
 * POST /api/instructor/payment-config/paypal
 */
export const updatePaypalConfig = async (req, res) => {
    try {
        const instructorId = req.user._id;
        const { paypal_email, paypal_merchant_id } = req.body;

        // Validaciones
        if (!paypal_email) {
            return res.status(400).json({
                success: false,
                message: 'El email de PayPal es requerido'
            });
        }

        // Buscar o crear configuración
        let config = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        if (!config) {
            config = new InstructorPaymentConfig({ instructor: instructorId });
        }

        // Actualizar datos de PayPal
        config.paypal_email = paypal_email;
        config.paypal_merchant_id = paypal_merchant_id || '';
        config.paypal_connected = true;
        config.paypal_verified = false; // Requiere verificación manual del admin

        // Si no tiene método preferido, establecer PayPal
        if (!config.preferred_payment_method) {
            config.preferred_payment_method = 'paypal';
        }

        await config.save();

        res.json({
            success: true,
            message: 'Configuración de PayPal actualizada exitosamente',
            config
        });
    } catch (error) {
        console.error('Error al actualizar PayPal:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar configuración de PayPal',
            error: error.message
        });
    }
};

/**
 * Actualizar/agregar configuración de cuenta bancaria
 * POST /api/instructor/payment-config/bank
 */
export const updateBankConfig = async (req, res) => {
    try {
        const instructorId = req.user._id;
        const {
            account_holder_name,
            bank_name,
            account_number,
            clabe,
            swift_code,
            account_type,
            card_brand
        } = req.body;

        // Validaciones
        if (!account_holder_name || !bank_name) {
            return res.status(400).json({
                success: false,
                message: 'El nombre del titular y banco son requeridos'
            });
        }

        if (!account_number && !clabe) {
            return res.status(400).json({
                success: false,
                message: 'Debes proporcionar número de cuenta o CLABE'
            });
        }

        // Buscar o crear configuración
        let config = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        if (!config) {
            config = new InstructorPaymentConfig({ instructor: instructorId });
        }

        // Encriptar datos sensibles
        let encryptedAccountNumber = '';
        let encryptedClabe = '';
        
        try {
            // Si el usuario proporciona un nuevo número de cuenta, actualizarlo
            if (account_number && account_number.toString().trim() !== '') {
                encryptedAccountNumber = encrypt(account_number.toString().trim());
            } else {
                // Mantener el número de cuenta existente si no se proporciona uno nuevo
                encryptedAccountNumber = config.bank_account?.account_number || '';
            }
            
            // Si el usuario proporciona una nueva CLABE, actualizarla
            if (clabe && clabe.toString().trim() !== '') {
                encryptedClabe = encrypt(clabe.toString().trim());
            } else {
                // Mantener la CLABE existente si no se proporciona una nueva
                encryptedClabe = config.bank_account?.clabe || '';
            }
        } catch (encryptError) {
            console.error('Error al encriptar:', encryptError);
            return res.status(500).json({
                success: false,
                message: 'Error al encriptar datos bancarios. Verifica que ENCRYPTION_KEY y ENCRYPTION_IV estén configurados correctamente en .env',
                error: encryptError.message
            });
        }

        // Actualizar datos bancarios
        config.bank_account = {
            account_holder_name,
            bank_name,
            account_number: encryptedAccountNumber,
            clabe: encryptedClabe,
            swift_code: swift_code || '',
            account_type: account_type || 'ahorros',
            card_brand: card_brand || '',
            verified: false // 🔥 SIEMPRE marcar como NO verificado al actualizar/crear
        };

        // Si no tiene método preferido, establecer transferencia bancaria
        if (!config.preferred_payment_method) {
            config.preferred_payment_method = 'bank_transfer';
        }

        await config.save();

        // Preparar respuesta sin datos sensibles
        const response = { ...config.toObject() };
        if (response.bank_account?.account_number && response.bank_account.account_number.trim() !== '') {
            try {
                const decrypted = decrypt(response.bank_account.account_number);
                response.bank_account.account_number_masked = maskAccountNumber(decrypted);
            } catch (err) {
                console.error('Error al desencriptar número de cuenta:', err);
            }
            delete response.bank_account.account_number;
        }
        if (response.bank_account?.clabe && response.bank_account.clabe.trim() !== '') {
            try {
                const decrypted = decrypt(response.bank_account.clabe);
                response.bank_account.clabe_masked = maskAccountNumber(decrypted);
            } catch (err) {
                console.error('Error al desencriptar CLABE:', err);
            }
            delete response.bank_account.clabe;
        }

        res.json({
            success: true,
            message: 'Configuración bancaria actualizada exitosamente',
            config: response
        });
    } catch (error) {
        console.error('Error al actualizar cuenta bancaria:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar configuración bancaria',
            error: error.message
        });
    }
};

/**
 * Actualizar método de pago preferido
 * PUT /api/instructor/payment-config
 */
export const updatePreferredPaymentMethod = async (req, res) => {
    try {
        const instructorId = req.user._id;
        const { preferred_payment_method } = req.body;

        // Validaciones
        if (!['paypal', 'bank_transfer'].includes(preferred_payment_method)) {
            return res.status(400).json({
                success: false,
                message: 'Método de pago inválido'
            });
        }

        const config = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        if (!config) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada. Configure primero un método de pago.'
            });
        }

        // Verificar que el método esté configurado
        if (preferred_payment_method === 'paypal' && !config.paypal_email) {
            return res.status(400).json({
                success: false,
                message: 'Debe configurar PayPal primero'
            });
        }

        if (preferred_payment_method === 'bank_transfer' && !config.bank_account?.account_number) {
            return res.status(400).json({
                success: false,
                message: 'Debe configurar cuenta bancaria primero'
            });
        }

        config.preferred_payment_method = preferred_payment_method;
        await config.save();

        res.json({
            success: true,
            message: 'Método de pago preferido actualizado',
            config
        });
    } catch (error) {
        console.error('Error al actualizar método preferido:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar método preferido',
            error: error.message
        });
    }
};

/**
 * Obtener lista de ganancias del instructor
 * GET /api/instructor/earnings?status=&startDate=&endDate=&page=&limit=
 */
export const getEarnings = async (req, res) => {
    try {
        const instructorId = req.user._id;
        const { 
            status, 
            startDate, 
            endDate, 
            page = 1, 
            limit = 20 
        } = req.query;

        // Construir filtros
        const filters = { instructor: instructorId };

        if (status && status !== 'all') {
            filters.status = status;
        }

        if (startDate || endDate) {
            filters.earned_at = {};
            if (startDate) {
                filters.earned_at.$gte = new Date(startDate);
            }
            if (endDate) {
                filters.earned_at.$lte = new Date(endDate);
            }
        }

        // Paginación
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        // Obtener earnings
        const earnings = await InstructorEarnings.find(filters)
            .populate('course', 'title image')
            .populate('sale', 'n_transaccion created_at')
            .sort({ earned_at: -1 })
            .skip(skip)
            .limit(limitNum);

        // 🔥 NUEVO: Verificar si algún earning está reembolsado
        const Refund = (await import('../models/Refund.js')).default;
        const saleIds = earnings.map(e => e.sale?._id).filter(Boolean);
        
        const refunds = await Refund.find({
            sale: { $in: saleIds },
            status: 'completed'
        });

        // Mapear earnings con información de reembolso
        const earningsWithRefundStatus = earnings.map(earning => {
            const earningObj = earning.toObject();
            
            // Buscar si este earning tiene un reembolso completado
            const hasRefund = refunds.some(r => 
                r.sale.toString() === earning.sale?._id?.toString()
            );
            
            if (hasRefund) {
                earningObj.isRefunded = true;
                earningObj.status_display = 'refunded';
                earningObj.instructor_earning_original = earning.instructor_earning;
                // La ganancia actual es $0 porque fue reembolsada
            }
            
            return earningObj;
        });

        // Contar total
        const total = await InstructorEarnings.countDocuments(filters);

        res.json({
            success: true,
            earnings: earningsWithRefundStatus,
            pagination: {
                page: parseInt(page),
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Error al obtener ganancias:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener ganancias',
            error: error.message
        });
    }
};

/**
 * Obtener estadísticas de ganancias del instructor
 * GET /api/instructor/earnings/stats
 */
export const getEarningsStats = async (req, res) => {
    try {
        const instructorId = req.user._id;
        
        console.log('📊 [getEarningsStats] Obteniendo stats para instructor:', instructorId);

        // 1️⃣ Obtener todas las ganancias del instructor
        const allEarnings = await InstructorEarnings.find({ instructor: instructorId });
        console.log('📊 [getEarningsStats] Total earnings encontrados:', allEarnings.length);

        // 2️⃣ Calcular estadísticas por estado (SIN ajustar por reembolsos aún)
        const statsByStatus = calculateEarningsStatsByStatus(allEarnings);
        
        // 3️⃣ Buscar reembolsos completados relacionados con las ventas del instructor
        const saleIds = allEarnings.map(e => e.sale).filter(Boolean);
        
        // ⚠️ IMPORTANTE: Importar el modelo Refund al inicio del archivo
        // import Refund from '../models/Refund.js';
        const Refund = (await import('../models/Refund.js')).default;
        
        const refunds = await Refund.find({
            sale: { $in: saleIds },
            status: 'completed' // Solo reembolsos completados
        }).populate('sale');
        
        console.log('💰 [getEarningsStats] Reembolsos completados encontrados:', refunds.length);

        // 4️⃣ Calcular el monto total que se debe restar por reembolsos
        let refundedAmount = 0;
        let refundedCount = 0;
        
        for (const refund of refunds) {
            // Buscar el earning asociado a esta venta
            const earning = allEarnings.find(e => 
                e.sale && e.sale.toString() === refund.sale._id.toString()
            );
            
            if (earning) {
                // ✅ SUMAR solo la ganancia del instructor (NO el precio total)
                refundedAmount += earning.instructor_earning;
                refundedCount++;
                
                console.log('🔄 [getEarningsStats] Restando reembolso:', {
                    saleId: refund.sale._id,
                    instructorEarning: earning.instructor_earning,
                    salePrice: earning.sale_price
                });
            }
        }

        // 5️⃣ Ajustar las estadísticas considerando los reembolsos
        const stats = {
            available: {
                total: Math.max(0, statsByStatus.available.total - refundedAmount),
                count: statsByStatus.available.count
            },
            pending: statsByStatus.pending,
            paid: statsByStatus.paid,
            disputed: statsByStatus.disputed,
            refunds: {
                total: refundedAmount,
                count: refundedCount
            },
            total: {
                total: Math.max(0, statsByStatus.total.total - refundedAmount),
                count: statsByStatus.total.count
            },
            byMonth: groupEarningsByMonth(allEarnings).slice(0, 6),
            totalCoursesSold: allEarnings.length,
            averagePerSale: allEarnings.length > 0 
                ? ((statsByStatus.total.total - refundedAmount) / allEarnings.length).toFixed(2)
                : 0
        };

        console.log('✅ [getEarningsStats] Stats finales:', {
            disponible: stats.available.total,
            reembolsos: stats.refunds.total,
            total: stats.total.total
        });

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('❌ [getEarningsStats] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas',
            error: error.message
        });
    }
};

/**
 * Obtener historial de pagos recibidos
 * GET /api/instructor/payments/history?page=&limit=
 */
export const getPaymentHistory = async (req, res) => {
    try {
        const instructorId = req.user._id;
        const { page = 1, limit = 10 } = req.query;

        // Paginación
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        // Obtener pagos completados
        const payments = await InstructorPayment.find({
            instructor: instructorId,
            status: { $in: ['completed', 'processing'] }
        })
            .populate('created_by', 'name email')
            .populate('earnings_included', 'course sale_price')
            .sort({ created_by_admin_at: -1 })
            .skip(skip)
            .limit(limitNum);

        // Contar total
        const total = await InstructorPayment.countDocuments({
            instructor: instructorId,
            status: { $in: ['completed', 'processing'] }
        });

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
 * Eliminar configuración de PayPal
 * DELETE /api/instructor/payment-config/paypal
 */
export const deletePaypalConfig = async (req, res) => {
    try {
        const instructorId = req.user._id;

        const config = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        if (!config) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada'
            });
        }

        // Limpiar datos de PayPal
        config.paypal_email = '';
        config.paypal_merchant_id = '';
        config.paypal_connected = false;
        config.paypal_verified = false;

        // Si PayPal era el método preferido, cambiar a bank_transfer o limpiar
        if (config.preferred_payment_method === 'paypal') {
            config.preferred_payment_method = config.bank_account?.account_number ? 'bank_transfer' : '';
        }

        await config.save();

        res.json({
            success: true,
            message: 'Configuración de PayPal eliminada exitosamente',
            config
        });
    } catch (error) {
        console.error('Error al eliminar PayPal:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar configuración de PayPal',
            error: error.message
        });
    }
};

/**
 * Eliminar configuración de cuenta bancaria
 * DELETE /api/instructor/payment-config/bank
 */
export const deleteBankConfig = async (req, res) => {
    try {
        const instructorId = req.user._id;

        const config = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        if (!config) {
            return res.status(404).json({
                success: false,
                message: 'Configuración no encontrada'
            });
        }

        // 🔥 OPCIÓN 1: Eliminar el documento completo si solo tenía cuenta bancaria
        if (!config.paypal_email && config.bank_account?.account_number) {
            console.log('🗑️ Eliminando documento completo de InstructorPaymentConfig para instructor:', instructorId);
            await InstructorPaymentConfig.deleteOne({ _id: config._id });
            
            return res.json({
                success: true,
                message: 'Configuración bancaria eliminada completamente (documento eliminado)',
                config: null
            });
        }

        // 🔥 OPCIÓN 2: Solo limpiar datos bancarios si también tiene PayPal
        console.log('🧹 Limpiando solo datos bancarios (mantiene documento con PayPal):', instructorId);
        
        // Eliminar completamente el objeto bank_account
        config.bank_account = undefined;

        // Si cuenta bancaria era el método preferido, cambiar a paypal o limpiar
        if (config.preferred_payment_method === 'bank_transfer') {
            config.preferred_payment_method = config.paypal_email ? 'paypal' : '';
        }

        await config.save();

        res.json({
            success: true,
            message: 'Configuración bancaria eliminada exitosamente',
            config
        });
    } catch (error) {
        console.error('Error al eliminar cuenta bancaria:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar configuración bancaria',
            error: error.message
        });
    }
};

export default {
    getPaymentConfig,
    updatePaypalConfig,
    updateBankConfig,
    deletePaypalConfig,
    deleteBankConfig,
    updatePreferredPaymentMethod,
    getEarnings,
    getEarningsStats,
    getPaymentHistory
};
