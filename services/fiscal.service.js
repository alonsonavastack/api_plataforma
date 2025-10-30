/**
 * 🌍 SERVICIO FISCAL MULTI-PAÍS
 * Sistema escalable para pagos a instructores internacionales
 * 
 * ARQUITECTURA:
 * - Sistema modular por país
 * - Soporta múltiples métodos de pago (PayPal, transferencias, Stripe, Wise)
 * - Conversión automática de divisas
 * - Reglas fiscales específicas por jurisdicción
 * 
 * PAÍSES SOPORTADOS:
 * - 🇲🇽 México (RESICO, Honorarios, Act. Empresarial)
 * - 🌎 Internacional (Reglas genéricas, fácil de extender)
 * 
 * @author Dev-Sharks Platform
 * @version 3.0.0
 */

import axios from 'axios';

// ═══════════════════════════════════════════════════════════════
// 💱 SERVICIO DE TIPOS DE CAMBIO
// ═══════════════════════════════════════════════════════════════

/**
 * Obtiene tipos de cambio actualizados
 * @param {string} baseCurrency - Moneda base (default: USD)
 * @returns {Promise<object>} - { rates, timestamp }
 */
export async function getExchangeRates(baseCurrency = 'USD') {
    try {
        const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${baseCurrency}`);
        return {
            rates: response.data.rates,
            timestamp: response.data.time_last_updated,
            baseCurrency
        };
    } catch (error) {
        console.warn('⚠️ Error al obtener tipos de cambio. Usando fallback.');
        return getFallbackRates(baseCurrency);
    }
}

/**
 * Tipos de cambio de respaldo (actualizar periódicamente)
 */
function getFallbackRates(baseCurrency) {
    const fallbackRates = {
        USD: {
            MXN: 17.50,
            EUR: 0.92,
            GBP: 0.79,
            CAD: 1.35,
            AUD: 1.52,
            BRL: 4.95,
            COP: 3950,
            ARS: 350,
            CLP: 900,
            PEN: 3.75
        }
    };
    
    return {
        rates: fallbackRates[baseCurrency] || {},
        timestamp: new Date().toISOString(),
        baseCurrency,
        isFallback: true
    };
}

/**
 * Convierte monto entre monedas
 * @param {number} amount - Monto a convertir
 * @param {string} from - Moneda origen
 * @param {string} to - Moneda destino
 * @param {object} rates - Objeto de tasas (opcional)
 * @returns {Promise<number>}
 */
export async function convertCurrency(amount, from, to, rates = null) {
    if (from === to) return amount;
    
    const exchangeRates = rates || await getExchangeRates(from);
    const rate = exchangeRates.rates[to];
    
    if (!rate) {
        throw new Error(`No se encontró tasa de cambio para ${from} → ${to}`);
    }
    
    return amount * rate;
}

// ═══════════════════════════════════════════════════════════════
// 🌍 CONFIGURACIÓN POR PAÍS
// ═══════════════════════════════════════════════════════════════

/**
 * Configuración fiscal y de pagos por país
 */
export const COUNTRY_CONFIGS = {
    // 🇲🇽 MÉXICO
    MX: {
        name: 'México',
        currency: 'MXN',
        taxCurrency: 'MXN', // Impuestos se calculan en MXN
        paymentMethods: ['bank_transfer', 'paypal', 'oxxo'],
        defaultPaymentMethod: 'bank_transfer',
        
        // Regímenes fiscales disponibles
        taxRegimes: {
            '626': {
                name: 'RESICO',
                description: 'Régimen Simplificado de Confianza',
                maxIncome: 3500000, // MXN
                vatRetention: 2/3, // 2/3 del IVA
                
                // Tasas escalonadas de ISR
                isrRates: [
                    { max: 300000, rate: 1.0 },
                    { max: 600000, rate: 1.5 },
                    { max: 1000000, rate: 2.0 },
                    { max: 1500000, rate: 2.5 },
                    { max: 3500000, rate: 3.0 }
                ]
            },
            '612': {
                name: 'Actividad Empresarial',
                description: 'Persona Física con Actividad Empresarial',
                vatRetention: 2/3,
                isrRate: 10 // Fijo 10%
            },
            '621': {
                name: 'Honorarios',
                description: 'Servicios Profesionales',
                vatRetention: 2/3,
                isrRate: 10.3 // ~10.3% promedio
            },
            'honorarios': {
                name: 'Honorarios',
                description: 'Servicios Profesionales (alias)',
                vatRetention: 2/3,
                isrRate: 10.3
            }
        },
        
        vatRate: 0.16, // 16% IVA
        requiresRFC: true,
        requiresBankAccount: true
    },
    
    // 🇺🇸 ESTADOS UNIDOS
    US: {
        name: 'United States',
        currency: 'USD',
        taxCurrency: 'USD',
        paymentMethods: ['paypal', 'stripe', 'bank_transfer'],
        defaultPaymentMethod: 'paypal',
        
        taxRegimes: {
            'independent_contractor': {
                name: '1099-MISC',
                description: 'Independent Contractor',
                vatRetention: 0, // No VAT in US
                isrRate: 0, // Platform doesn\'t withhold income tax
                requiresW9: true
            }
        },
        
        vatRate: 0,
        requiresSSN: true,
        requiresTaxID: true
    },
    
    // 🇪🇸 ESPAÑA
    ES: {
        name: 'España',
        currency: 'EUR',
        taxCurrency: 'EUR',
        paymentMethods: ['bank_transfer', 'paypal', 'sepa'],
        defaultPaymentMethod: 'sepa',
        
        taxRegimes: {
            'autonomo': {
                name: 'Autónomo',
                description: 'Trabajador por cuenta propia',
                vatRetention: 0,
                isrRate: 15 // Retención del 15%
            }
        },
        
        vatRate: 0.21, // 21% IVA
        requiresNIF: true
    },
    
    // 🇦🇷 ARGENTINA
    AR: {
        name: 'Argentina',
        currency: 'ARS',
        taxCurrency: 'ARS',
        paymentMethods: ['bank_transfer', 'paypal'],
        defaultPaymentMethod: 'bank_transfer',
        
        taxRegimes: {
            'monotributo': {
                name: 'Monotributo',
                description: 'Régimen Simplificado',
                vatRetention: 0,
                isrRate: 0 // Paga cuota fija mensual
            },
            'responsable_inscripto': {
                name: 'Responsable Inscripto',
                description: 'Régimen General',
                vatRetention: 0,
                isrRate: 0
            }
        },
        
        vatRate: 0.21, // 21% IVA
        requiresCUIT: true
    },
    
    // 🌎 INTERNACIONAL (DEFAULT)
    INTL: {
        name: 'International',
        currency: 'USD',
        taxCurrency: 'USD',
        paymentMethods: ['paypal', 'wise', 'payoneer'],
        defaultPaymentMethod: 'paypal',
        
        taxRegimes: {
            'freelancer': {
                name: 'Freelancer',
                description: 'Independent contractor',
                vatRetention: 0,
                isrRate: 0 // No withholding
            }
        },
        
        vatRate: 0,
        requiresTaxID: false
    }
};

/**
 * Obtiene configuración del país del instructor
 * @param {string} countryCode - Código ISO del país (MX, US, ES, etc.)
 * @returns {object} - Configuración del país
 */
export function getCountryConfig(countryCode) {
    return COUNTRY_CONFIGS[countryCode] || COUNTRY_CONFIGS.INTL;
}

// ═══════════════════════════════════════════════════════════════
// 🧮 CÁLCULOS FISCALES POR RÉGIMEN
// ═══════════════════════════════════════════════════════════════

/**
 * Calcula ISR para RESICO (626) - México
 * @param {number} ingresoAcumuladoMXN - Ingreso acumulado en el año
 * @param {number} montoVentaMXN - Monto de esta venta
 * @returns {object} - { rate, amount }
 */
function calculateISR_RESICO(ingresoAcumuladoMXN, montoVentaMXN) {
    const config = COUNTRY_CONFIGS.MX.taxRegimes['626'];
    
    // Buscar la tasa correspondiente
    let rate = 3.0; // Default si supera límite
    for (const tier of config.isrRates) {
        if (ingresoAcumuladoMXN <= tier.max) {
            rate = tier.rate;
            break;
        }
    }
    
    const amount = (montoVentaMXN * rate) / 100;
    
    return { rate, amount };
}

/**
 * Calcula ISR según régimen fiscal
 * @param {string} countryCode - Código del país
 * @param {string} regimeCode - Código del régimen
 * @param {number} ingresoAcumulado - Ingreso acumulado (en moneda fiscal)
 * @param {number} montoVenta - Monto de la venta (en moneda fiscal)
 * @returns {object} - { rate, amount }
 */
export function calculateISR(countryCode, regimeCode, ingresoAcumulado, montoVenta) {
    const countryConfig = getCountryConfig(countryCode);
    const regime = countryConfig.taxRegimes[regimeCode];
    
    if (!regime) {
        console.warn(`⚠️ Régimen ${regimeCode} no encontrado para ${countryCode}`);
        return { rate: 0, amount: 0 };
    }
    
    // Caso especial: RESICO con tasas escalonadas
    if (regimeCode === '626') {
        return calculateISR_RESICO(ingresoAcumulado, montoVenta);
    }
    
    // Régimen con tasa fija
    const rate = regime.isrRate || 0;
    const amount = (montoVenta * rate) / 100;
    
    return { rate, amount };
}

/**
 * Calcula retención de IVA según país
 * @param {string} countryCode - Código del país
 * @param {string} regimeCode - Código del régimen
 * @param {number} subtotalSinIVA - Subtotal sin IVA
 * @returns {object} - { iva, retencionIVA, ivaTrasladado }
 */
export function calculateVAT(countryCode, regimeCode, subtotalSinIVA) {
    const countryConfig = getCountryConfig(countryCode);
    const regime = countryConfig.taxRegimes[regimeCode];
    
    const vatRate = countryConfig.vatRate || 0;
    const iva = subtotalSinIVA * vatRate;
    
    const vatRetentionRate = regime?.vatRetention || 0;
    const retencionIVA = iva * vatRetentionRate;
    const ivaTrasladado = iva - retencionIVA;
    
    return {
        iva,
        retencionIVA,
        ivaTrasladado,
        vatRate: vatRate * 100
    };
}

// ═══════════════════════════════════════════════════════════════
// 💰 CÁLCULO COMPLETO DE PAGO
// ═══════════════════════════════════════════════════════════════

/**
 * 🎯 FUNCIÓN PRINCIPAL: Calcula pago al instructor
 * 
 * FLUJO UNIVERSAL:
 * 1. Convierte venta USD → Moneda fiscal del país
 * 2. Resta comisión de plataforma
 * 3. Calcula impuestos según régimen del país
 * 4. Convierte resultado final a moneda de pago preferida
 * 5. Calcula comisiones de método de pago (PayPal, etc.)
 * 
 * @param {object} params - Parámetros de cálculo
 * @returns {Promise<object>} - Desglose completo
 */
export async function calculateInstructorPayout(params) {
    const {
        saleAmountUSD,           // Monto de venta en USD
        platformCommissionRate,  // % comisión plataforma (ej: 10)
        instructor,              // Objeto instructor con país y régimen
        exchangeRates = null     // Tasas de cambio (opcional)
    } = params;
    
    // 1️⃣ OBTENER CONFIGURACIÓN DEL PAÍS
    const countryCode = instructor.country || 'INTL';
    const countryConfig = getCountryConfig(countryCode);
    
    const regimeCode = instructor.fiscal?.regimenFiscal || 
                       Object.keys(countryConfig.taxRegimes)[0];
    
    // 2️⃣ OBTENER TASAS DE CAMBIO
    const rates = exchangeRates || await getExchangeRates('USD');
    
    // 3️⃣ CONVERTIR VENTA A MONEDA FISCAL
    const saleTaxCurrency = await convertCurrency(
        saleAmountUSD,
        'USD',
        countryConfig.taxCurrency,
        rates
    );
    
    // 4️⃣ CALCULAR COMISIÓN DE PLATAFORMA
    const platformCommission = saleTaxCurrency * (platformCommissionRate / 100);
    const amountAfterCommission = saleTaxCurrency - platformCommission;
    
    // 5️⃣ SEPARAR IVA SI APLICA
    const vatRate = countryConfig.vatRate || 0;
    const subtotalSinIVA = vatRate > 0 
        ? amountAfterCommission / (1 + vatRate)
        : amountAfterCommission;
    
    // 6️⃣ CALCULAR IVA Y RETENCIONES
    const vatCalculation = calculateVAT(countryCode, regimeCode, subtotalSinIVA);
    
    // 7️⃣ CALCULAR ISR
    const ingresoAcumulado = instructor.fiscal?.ingresoAcumuladoAnual || 0;
    const isrCalculation = calculateISR(
        countryCode,
        regimeCode,
        ingresoAcumulado,
        subtotalSinIVA
    );
    
    // 8️⃣ CALCULAR NETO EN MONEDA FISCAL
    const netoTaxCurrency = subtotalSinIVA + 
                            vatCalculation.ivaTrasladado - 
                            isrCalculation.amount;
    
    // 9️⃣ CONVERTIR A MONEDA DE PAGO PREFERIDA
    const paymentCurrency = instructor.fiscal?.cuentaBancaria?.currency || 
                           countryConfig.currency;
    
    const netoPaymentCurrency = await convertCurrency(
        netoTaxCurrency,
        countryConfig.taxCurrency,
        paymentCurrency,
        rates
    );
    
    // 🔟 CALCULAR COMISIÓN DEL MÉTODO DE PAGO
    const paymentMethod = instructor.paymentMethod || countryConfig.defaultPaymentMethod;
    const paymentFee = calculatePaymentFee(netoPaymentCurrency, paymentMethod);
    
    const finalAmount = netoPaymentCurrency - paymentFee.amount;
    
    // 📊 RETORNAR DESGLOSE COMPLETO
    return {
        // Información general
        instructor: {
            id: instructor._id,
            name: instructor.name,
            country: countryCode,
            countryName: countryConfig.name,
            regime: regimeCode,
            regimeName: countryConfig.taxRegimes[regimeCode]?.name
        },
        
        // Montos originales
        sale: {
            amountUSD: saleAmountUSD,
            amountTaxCurrency: saleTaxCurrency,
            currency: 'USD',
            taxCurrency: countryConfig.taxCurrency
        },
        
        // Comisión de plataforma
        platform: {
            commissionRate: platformCommissionRate,
            commissionAmount: platformCommission,
            currency: countryConfig.taxCurrency
        },
        
        // Desglose fiscal
        tax: {
            subtotalSinIVA: subtotalSinIVA,
            iva: vatCalculation.iva,
            retencionIVA: vatCalculation.retencionIVA,
            ivaTrasladado: vatCalculation.ivaTrasladado,
            vatRate: vatCalculation.vatRate,
            
            isrRate: isrCalculation.rate,
            isrAmount: isrCalculation.amount,
            
            ingresoAcumuladoAntes: ingresoAcumulado,
            ingresoAcumuladoDespues: ingresoAcumulado + subtotalSinIVA,
            
            currency: countryConfig.taxCurrency
        },
        
        // Método de pago
        payment: {
            method: paymentMethod,
            currency: paymentCurrency,
            netoBeforeFee: netoPaymentCurrency,
            feeRate: paymentFee.rate,
            feeAmount: paymentFee.amount,
            finalAmount: finalAmount
        },
        
        // Metadata
        exchangeRates: {
            USD_to_taxCurrency: rates.rates[countryConfig.taxCurrency],
            taxCurrency_to_paymentCurrency: paymentCurrency !== countryConfig.taxCurrency
                ? rates.rates[paymentCurrency] / rates.rates[countryConfig.taxCurrency]
                : 1,
            timestamp: rates.timestamp
        },
        
        // Resumen
        summary: {
            totalInstructorReceives: finalAmount,
            currency: paymentCurrency,
            totalInstructorReceivesUSD: await convertCurrency(finalAmount, paymentCurrency, 'USD', rates)
        }
    };
}

/**
 * Calcula comisión del método de pago
 * @param {number} amount - Monto
 * @param {string} method - Método de pago
 * @returns {object} - { rate, amount }
 */
function calculatePaymentFee(amount, method) {
    const fees = {
        paypal: {
            rate: 3.5, // 3.5% + fijo
            fixed: 0.30
        },
        stripe: {
            rate: 2.9,
            fixed: 0.30
        },
        wise: {
            rate: 1.5,
            fixed: 0
        },
        bank_transfer: {
            rate: 0,
            fixed: 0
        },
        sepa: {
            rate: 0.5,
            fixed: 0
        }
    };
    
    const feeConfig = fees[method] || { rate: 0, fixed: 0 };
    const feeAmount = (amount * feeConfig.rate / 100) + feeConfig.fixed;
    
    return {
        rate: feeConfig.rate,
        fixed: feeConfig.fixed,
        amount: feeAmount
    };
}

// ═══════════════════════════════════════════════════════════════
// ⚠️ VALIDACIONES Y ALERTAS
// ═══════════════════════════════════════════════════════════════

/**
 * Verifica si el instructor puede seguir en su régimen actual
 * @param {object} instructor - Objeto instructor
 * @param {number} nuevoIngreso - Nuevo ingreso a sumar
 * @returns {object} - Estado y alertas
 */
export function validateTaxLimits(instructor, nuevoIngreso) {
    const countryCode = instructor.country || 'INTL';
    const countryConfig = getCountryConfig(countryCode);
    const regimeCode = instructor.fiscal?.regimenFiscal;
    
    if (!regimeCode) {
        return {
            canContinue: true,
            alerts: []
        };
    }
    
    const regime = countryConfig.taxRegimes[regimeCode];
    const maxIncome = regime?.maxIncome;
    
    if (!maxIncome) {
        return {
            canContinue: true,
            alerts: []
        };
    }
    
    const ingresoAcumulado = instructor.fiscal?.ingresoAcumuladoAnual || 0;
    const nuevoTotal = ingresoAcumulado + nuevoIngreso;
    const porcentaje = (nuevoTotal / maxIncome) * 100;
    
    const alerts = [];
    
    if (porcentaje >= 100) {
        alerts.push({
            level: 'critical',
            code: 'LIMIT_EXCEEDED',
            message: `Has superado el límite de ${regime.name}. Debes cambiar de régimen fiscal.`,
            action: 'block'
        });
    } else if (porcentaje >= 90) {
        alerts.push({
            level: 'warning',
            code: 'LIMIT_90',
            message: `Estás al ${porcentaje.toFixed(1)}% del límite de ${regime.name}.`,
            action: 'alert'
        });
    } else if (porcentaje >= 80) {
        alerts.push({
            level: 'info',
            code: 'LIMIT_80',
            message: `Has alcanzado el ${porcentaje.toFixed(1)}% del límite de ${regime.name}.`,
            action: 'notify'
        });
    }
    
    return {
        canContinue: porcentaje < 100,
        percentage: porcentaje,
        alerts,
        currentIncome: nuevoTotal,
        limit: maxIncome,
        currency: countryConfig.taxCurrency
    };
}

/**
 * Resetea ingreso acumulado al inicio de año
 * @param {object} instructor - Documento del instructor
 * @returns {Promise<boolean>}
 */
export async function resetAnnualIncome(instructor) {
    try {
        const currentYear = new Date().getFullYear();
        
        if (instructor.fiscal?.anioFiscalActual < currentYear) {
            instructor.fiscal.ingresoAcumuladoAnual = 0;
            instructor.fiscal.anioFiscalActual = currentYear;
            instructor.fiscal.alertaLimite80Enviada = false;
            instructor.fiscal.alertaLimite90Enviada = false;
            instructor.fiscal.bloqueadoPorLimite = false;
            
            await instructor.save();
            
            console.log(`✅ Ingreso anual reseteado: ${instructor.name}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ Error al resetear ingreso:', error);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════

export default {
    // Tipos de cambio
    getExchangeRates,
    convertCurrency,
    
    // Configuración
    getCountryConfig,
    COUNTRY_CONFIGS,
    
    // Cálculos
    calculateISR,
    calculateVAT,
    calculateInstructorPayout,
    
    // Validaciones
    validateTaxLimits,
    resetAnnualIncome
};