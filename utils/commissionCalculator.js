import PlatformCommissionSettings from '../models/PlatformCommissionSettings.js';

/**
 * UTILIDAD PARA CÁLCULOS DE COMISIONES
 * Centraliza toda la lógica de cálculo de ganancias y comisiones
 */

/**
 * Calcula las ganancias del instructor a partir del precio de venta
 * @param {number} salePrice - Precio de venta del curso
 * @param {number} commissionRate - Porcentaje de comisión (0-100)
 * @returns {Object} Objeto con todos los cálculos
 * @returns {number} return.salePrice - Precio original
 * @returns {number} return.commissionRate - Tasa de comisión aplicada
 * @returns {number} return.platformCommission - Monto que se queda la plataforma
 * @returns {number} return.instructorEarning - Monto que recibe el instructor
 */
export function calculateEarnings(salePrice, commissionRate) {
    // Validaciones
    if (typeof salePrice !== 'number' || salePrice < 0) {
        throw new Error('El precio de venta debe ser un número positivo');
    }

    if (typeof commissionRate !== 'number' || commissionRate < 0 || commissionRate > 100) {
        throw new Error('La tasa de comisión debe estar entre 0 y 100');
    }

    // Cálculos
    const platformCommission = (salePrice * commissionRate) / 100;
    const instructorEarning = salePrice - platformCommission;

    return {
        salePrice: parseFloat(salePrice.toFixed(2)),
        commissionRate: parseFloat(commissionRate.toFixed(2)),
        platformCommission: parseFloat(platformCommission.toFixed(2)),
        instructorEarning: parseFloat(instructorEarning.toFixed(2))
    };
}

/**
 * Obtiene la tasa de comisión para un instructor específico
 * Busca comisión personalizada, si no existe usa la global
 * @param {string|ObjectId} instructorId - ID del instructor
 * @returns {Promise<number>} Tasa de comisión del instructor
 */
export async function getInstructorCommissionRate(instructorId) {
    try {
        if (!instructorId) {
            throw new Error('instructorId es requerido');
        }

        const rate = await PlatformCommissionSettings.getInstructorCommissionRate(instructorId);
        return rate;
    } catch (error) {
        console.error('Error al obtener tasa de comisión:', error.message);
        // En caso de error, usar tasa por defecto (30%)
        return 30;
    }
}

/**
 * Calcula las ganancias de un instructor para una venta específica
 * @param {string|ObjectId} instructorId - ID del instructor
 * @param {number} salePrice - Precio de venta
 * @returns {Promise<Object>} Objeto con los cálculos completos
 */
export async function calculateInstructorEarnings(instructorId, salePrice) {
    const commissionRate = await getInstructorCommissionRate(instructorId);
    return calculateEarnings(salePrice, commissionRate);
}

/**
 * Calcula el total de ganancias de múltiples earnings
 * @param {Array<Object>} earnings - Array de objetos earning
 * @returns {Object} Totales calculados
 */
export function calculateTotalEarnings(earnings) {
    if (!Array.isArray(earnings)) {
        throw new Error('earnings debe ser un array');
    }

    const totals = earnings.reduce((acc, earning) => {
        return {
            totalSales: acc.totalSales + (earning.sale_price || 0),
            totalPlatformCommission: acc.totalPlatformCommission + (earning.platform_commission_amount || 0),
            totalInstructorEarnings: acc.totalInstructorEarnings + (earning.instructor_earning || 0),
            count: acc.count + 1
        };
    }, {
        totalSales: 0,
        totalPlatformCommission: 0,
        totalInstructorEarnings: 0,
        count: 0
    });

    // Calcular promedios
    totals.averageCommissionRate = totals.count > 0
        ? ((totals.totalPlatformCommission / totals.totalSales) * 100).toFixed(2)
        : 0;

    // Redondear a 2 decimales
    totals.totalSales = parseFloat(totals.totalSales.toFixed(2));
    totals.totalPlatformCommission = parseFloat(totals.totalPlatformCommission.toFixed(2));
    totals.totalInstructorEarnings = parseFloat(totals.totalInstructorEarnings.toFixed(2));

    return totals;
}

/**
 * Calcula el monto final de un pago considerando deducciones
 * @param {number} totalEarnings - Total de ganancias a pagar
 * @param {number} deductions - Deducciones adicionales (opcional)
 * @returns {Object} Cálculo del pago final
 */
export function calculatePaymentAmount(totalEarnings, deductions = 0) {
    if (typeof totalEarnings !== 'number' || totalEarnings < 0) {
        throw new Error('totalEarnings debe ser un número positivo');
    }

    if (typeof deductions !== 'number' || deductions < 0) {
        throw new Error('deductions debe ser un número positivo');
    }

    const finalAmount = Math.max(0, totalEarnings - deductions);

    return {
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        deductions: parseFloat(deductions.toFixed(2)),
        finalAmount: parseFloat(finalAmount.toFixed(2))
    };
}

/**
 * Verifica si el monto alcanza el umbral mínimo para pago
 * @param {number} amount - Monto a verificar
 * @param {number} threshold - Umbral mínimo (opcional, se obtiene de settings)
 * @returns {Promise<Object>} Resultado de la verificación
 */
export async function checkMinimumThreshold(amount, threshold = null) {
    try {
        // Si no se proporciona threshold, obtenerlo de la configuración
        if (threshold === null) {
            const settings = await PlatformCommissionSettings.getSettings();
            threshold = settings.minimum_payment_threshold;
        }

        const meetsThreshold = amount >= threshold;
        const remaining = meetsThreshold ? 0 : threshold - amount;

        return {
            amount: parseFloat(amount.toFixed(2)),
            threshold: parseFloat(threshold.toFixed(2)),
            meetsThreshold,
            remaining: parseFloat(remaining.toFixed(2))
        };
    } catch (error) {
        console.error('Error al verificar umbral mínimo:', error.message);
        throw error;
    }
}

/**
 * Convierte montos entre monedas (USD <-> MXN)
 * @param {number} amount - Monto a convertir
 * @param {string} fromCurrency - Moneda origen ('USD' o 'MXN')
 * @param {string} toCurrency - Moneda destino ('USD' o 'MXN')
 * @param {number} exchangeRate - Tasa de cambio USD a MXN (opcional)
 * @returns {Promise<Object>} Resultado de la conversión
 */
export async function convertCurrency(amount, fromCurrency, toCurrency, exchangeRate = null) {
    try {
        // Si las monedas son iguales, no hay conversión
        if (fromCurrency === toCurrency) {
            return {
                originalAmount: amount,
                originalCurrency: fromCurrency,
                convertedAmount: amount,
                convertedCurrency: toCurrency,
                exchangeRate: 1
            };
        }

        // Obtener tasa de cambio si no se proporciona
        if (exchangeRate === null) {
            const settings = await PlatformCommissionSettings.getSettings();
            exchangeRate = settings.exchange_rate_usd_to_mxn;
        }

        let convertedAmount;

        if (fromCurrency === 'USD' && toCurrency === 'MXN') {
            // USD a MXN
            convertedAmount = amount * exchangeRate;
        } else if (fromCurrency === 'MXN' && toCurrency === 'USD') {
            // MXN a USD
            convertedAmount = amount / exchangeRate;
        } else {
            throw new Error('Monedas no soportadas. Use USD o MXN');
        }

        return {
            originalAmount: parseFloat(amount.toFixed(2)),
            originalCurrency: fromCurrency,
            convertedAmount: parseFloat(convertedAmount.toFixed(2)),
            convertedCurrency: toCurrency,
            exchangeRate: parseFloat(exchangeRate.toFixed(2))
        };
    } catch (error) {
        console.error('Error al convertir moneda:', error.message);
        throw error;
    }
}

/**
 * Calcula estadísticas de ganancias por estado
 * @param {Array<Object>} earnings - Array de earnings
 * @returns {Object} Estadísticas por estado
 */
export function calculateEarningsStatsByStatus(earnings) {
    if (!Array.isArray(earnings)) {
        throw new Error('earnings debe ser un array');
    }

    const stats = {
        pending: { count: 0, total: 0 },
        available: { count: 0, total: 0 },
        paid: { count: 0, total: 0 },
        disputed: { count: 0, total: 0 },
        total: { count: 0, total: 0 }
    };

    earnings.forEach(earning => {
        const status = earning.status || 'pending';
        const amount = earning.instructor_earning || 0;

        if (stats[status]) {
            stats[status].count++;
            stats[status].total += amount;
        }

        stats.total.count++;
        stats.total.total += amount;
    });

    // Redondear totales
    Object.keys(stats).forEach(key => {
        stats[key].total = parseFloat(stats[key].total.toFixed(2));
    });

    return stats;
}

/**
 * Desglosa un pago de PayPal (México) o Stripe en: Comisión, Neto, Instructor (70%), Plataforma (30%)
 * Fórmula PayPal MX estándar: 3.95% + $4.00 MXN + IVA (16%)
 * Fórmula Stripe MX estándar: 4.4% + $4.00 MXN + IVA (16%)
 * @param {number} amount - Monto TOTAL pagado por el cliente (MXN)
 * @param {string} gateway - 'paypal' o 'stripe'
 * @returns {Object} Desglose financiero
 */
export function calculatePaymentSplit(amount, gateway = 'paypal') {
    // 1. Validaciones básicas
    if (typeof amount !== 'number' || amount <= 0) {
        return {
            error: true,
            message: 'El monto debe ser mayor a 0',
            paypalFee: 0,
            netAmount: 0,
            vendorShare: 0,
            platformShare: 0
        };
    }

    // 2. Cálculo de Comisión Pasarela
    const FIXED_FEE = 4.00;
    // Stripe cobra 4.4% + $4.00, PayPal cobra 3.95% + $4.00. Ambos + IVA
    const PERCENTAGE_FEE = gateway === 'stripe' ? 0.044 : 0.0395;
    const IVA = 1.16;

    // Cálculo inicial
    let rawFee = ((amount * PERCENTAGE_FEE) + FIXED_FEE) * IVA;

    // REDONDEO STEP 1: Fee de pasarela a 2 decimales
    let gatewayFee = parseFloat(rawFee.toFixed(2));

    // El fee no puede ser mayor al monto
    if (gatewayFee > amount) {
        gatewayFee = amount;
    }

    // 3. Monto Neto (Usando el fee ya redondeado para que cuadre la visualización)
    // 15 - 5.33 = 9.67
    const netAmount = parseFloat((amount - gatewayFee).toFixed(2));

    // 4. Reparto (Split) 70% Vendor / 30% Plataforma sobre el NETO
    let vendorShare = 0;
    let platformShare = 0;

    if (netAmount > 0) {
        // REDONDEO STEP 2: Vendor share a 2 decimales
        vendorShare = parseFloat((netAmount * 0.70).toFixed(2));

        // REDONDEO STEP 3: Platform share es el restante exacto
        // Esto evita que 6.77 + 2.90 != 9.67 por temas de redondeo independiente
        platformShare = parseFloat((netAmount - vendorShare).toFixed(2));
    }

    return {
        totalPaid: parseFloat(amount.toFixed(2)),
        paypalFee: gatewayFee, // Manteniendo esta propiedad temporalmente por retrocompatibilidad
        stripeFee: gatewayFee, // Nueva propiedad
        netAmount: netAmount,
        vendorShare: vendorShare,
        platformShare: platformShare,
        currency: 'MXN'
    };
}

export default {
    calculateEarnings,
    getInstructorCommissionRate,
    calculateInstructorEarnings,
    calculateTotalEarnings,
    calculatePaymentAmount,
    checkMinimumThreshold,
    convertCurrency,
    calculateEarningsStatsByStatus,
    calculatePaymentSplit
};
