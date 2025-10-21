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

        // Desencriptar datos bancarios si existen
        if (config.bank_account?.account_number) {
            const decryptedAccountNumber = decrypt(config.bank_account.account_number);
            config.bank_account.account_number_masked = maskAccountNumber(decryptedAccountNumber);
            // No enviar el número completo al frontend
            config.bank_account.account_number = undefined;
        }

        if (config.bank_account?.clabe) {
            const decryptedClabe = decrypt(config.bank_account.clabe);
            config.bank_account.clabe_masked = maskAccountNumber(decryptedClabe);
            config.bank_account.clabe = undefined;
        }

        res.json({
            success: true,
            config
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
            if (account_number) {
                encryptedAccountNumber = encrypt(account_number.toString().trim());
            }
            if (clabe) {
                encryptedClabe = encrypt(clabe.toString().trim());
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
            verified: false // Requiere verificación manual del admin
        };

        // Si no tiene método preferido, establecer transferencia bancaria
        if (!config.preferred_payment_method) {
            config.preferred_payment_method = 'bank_transfer';
        }

        await config.save();

        // Preparar respuesta sin datos sensibles
        const response = { ...config.toObject() };
        if (response.bank_account?.account_number) {
            const decrypted = decrypt(response.bank_account.account_number);
            response.bank_account.account_number_masked = maskAccountNumber(decrypted);
            response.bank_account.account_number = undefined;
        }
        if (response.bank_account?.clabe) {
            const decrypted = decrypt(response.bank_account.clabe);
            response.bank_account.clabe_masked = maskAccountNumber(decrypted);
            response.bank_account.clabe = undefined;
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

        // Contar total
        const total = await InstructorEarnings.countDocuments(filters);

        res.json({
            success: true,
            earnings,
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

        // Obtener todas las ganancias del instructor
        const allEarnings = await InstructorEarnings.find({ instructor: instructorId });

        // Calcular estadísticas por estado
        const statsByStatus = calculateEarningsStatsByStatus(allEarnings);

        // Agrupar por mes (últimos 6 meses)
        const earningsByMonth = groupEarningsByMonth(allEarnings).slice(0, 6);

        // Estadísticas adicionales
        const stats = {
            ...statsByStatus,
            byMonth: earningsByMonth,
            totalCoursesSold: allEarnings.length,
            averagePerSale: allEarnings.length > 0 
                ? (statsByStatus.total.total / allEarnings.length).toFixed(2)
                : 0
        };

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
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

        // Limpiar datos bancarios
        config.bank_account = {
            account_holder_name: '',
            bank_name: '',
            account_number: '',
            clabe: '',
            swift_code: '',
            account_type: '',
            card_brand: '',
            verified: false
        };

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
