/**
 * 🌍 SERVICIO FISCAL MULTI-PAÍS
 * 
 * Sistema completo de cálculos fiscales para pagos a instructores de TODO EL MUNDO.
 * Soporta múltiples países, monedas, métodos de pago y regímenes fiscales.
 * 
 * IMPORTANTE: Las ventas YA incluyen IVA (precio final al cliente)
 * 
 * @version 3.1.0
 * @date 27 de Octubre, 2025
 */

// ====================================================================
// 🌎 CONFIGURACIÓN DE PAÍSES
// ====================================================================

export const COUNTRY_CONFIGS = {
  // 🇲🇽 MÉXICO
  MX: {
    name: 'México',
    currency: 'MXN',
    taxCurrency: 'MXN',
    paymentMethods: ['bank_transfer', 'paypal', 'oxxo'],
    defaultPaymentMethod: 'bank_transfer',
    
    taxRegimes: {
      '626': { // RESICO
        name: 'Régimen Simplificado de Confianza (RESICO)',
        description: 'Para personas físicas con ingresos hasta 3.5M MXN anuales',
        vatRetention: 2/3, // Se retiene 2/3 del IVA
        isrProgressive: true,
        isrRates: [
          { limit: 300000, rate: 1.0 },
          { limit: 1000000, rate: 1.1 },
          { limit: 3500000, rate: 2.5 }
        ],
        annualLimit: 3500000, // 3.5M MXN
        requiresRFC: true
      },
      'honorarios': { // Honorarios (Asimilables a salarios)
        name: 'Honorarios',
        description: 'Prestación de servicios profesionales',
        vatRetention: 2/3,
        isrRate: 10,
        requiresRFC: true
      },
      '612': { // Actividad Empresarial
        name: 'Actividad Empresarial',
        description: 'Persona física con actividad empresarial',
        vatRetention: 0,
        isrRate: 0, // Retención gradual según ingresos
        requiresRFC: true
      }
    },
    
    vatRate: 0.16, // 16% IVA
    requiresRFC: true
  },

  // 🇺🇸 USA
  US: {
    name: 'United States',
    currency: 'USD',
    taxCurrency: 'USD',
    paymentMethods: ['paypal', 'stripe', 'bank_transfer', 'wise'],
    defaultPaymentMethod: 'paypal',
    
    taxRegimes: {
      'independent_contractor': {
        name: 'Independent Contractor',
        description: 'Self-employed professional (1099 form)',
        vatRetention: 0,
        isrRate: 0, // No withholding tax
        requiresSSN: true
      }
    },
    
    vatRate: 0, // No federal VAT (sales tax varies by state)
    requiresSSN: true
  },

  // 🇪🇸 ESPAÑA
  ES: {
    name: 'España',
    currency: 'EUR',
    taxCurrency: 'EUR',
    paymentMethods: ['sepa', 'paypal', 'bank_transfer'],
    defaultPaymentMethod: 'sepa',
    
    taxRegimes: {
      'autonomo': {
        name: 'Autónomo',
        description: 'Trabajador autónomo',
        vatRetention: 0,
        isrRate: 15, // Retención IRPF
        requiresNIF: true
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
        description: 'Régimen simplificado para pequeños contribuyentes',
        vatRetention: 0,
        isrRate: 0,
        requiresCUIT: true
      },
      'responsable_inscripto': {
        name: 'Responsable Inscripto',
        description: 'Régimen general con facturación',
        vatRetention: 0,
        isrRate: 0,
        requiresCUIT: true
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
        description: 'Independent professional (no tax withholding)',
        vatRetention: 0,
        isrRate: 0
      }
    },
    
    vatRate: 0
  }
};

// ====================================================================
// 💳 CONFIGURACIÓN DE MÉTODOS DE PAGO
// ====================================================================

const PAYMENT_FEES = {
  paypal: {
    rate: 3.5,
    fixed: 0.30,
    currency: 'USD'
  },
  stripe: {
    rate: 2.9,
    fixed: 0.30,
    currency: 'USD'
  },
  wise: {
    rate: 1.5,
    fixed: 0,
    currency: 'USD'
  },
  payoneer: {
    rate: 2.0,
    fixed: 0,
    currency: 'USD'
  },
  bank_transfer: {
    rate: 0,
    fixed: 0,
    currency: 'MXN'
  },
  oxxo: {
    rate: 3.0,
    fixed: 0,
    currency: 'MXN'
  },
  sepa: {
    rate: 0.5,
    fixed: 0,
    currency: 'EUR'
  }
};

// ====================================================================
// 💱 TIPOS DE CAMBIO (SE ACTUALIZAN DESDE API EXTERNA)
// ====================================================================

let exchangeRatesCache = null;
let lastFetchTime = null;
const CACHE_DURATION = 3600000; // 1 hora

/**
 * Obtiene tipos de cambio actualizados
 */
async function getExchangeRates() {
  // Si tenemos cache reciente, usar ese
  if (exchangeRatesCache && lastFetchTime && (Date.now() - lastFetchTime < CACHE_DURATION)) {
    return exchangeRatesCache;
  }

  try {
    // 🔥 TODO: Aquí conectar con API real de tipos de cambio
    // Ejemplo: exchangeratesapi.io, fixer.io, openexchangerates.org
    
    // Por ahora, usar valores fallback
    const rates = getFallbackRates();
    
    exchangeRatesCache = rates;
    lastFetchTime = Date.now();
    
    return rates;
  } catch (error) {
    console.warn('⚠️ Error obteniendo tipos de cambio, usando fallback:', error.message);
    return getFallbackRates();
  }
}

/**
 * Tipos de cambio fallback (actualizar manualmente)
 */
function getFallbackRates() {
  return {
    timestamp: new Date(),
    base: 'USD',
    rates: {
      USD: 1,
      MXN: 17.50,
      EUR: 0.93,
      ARS: 350.00,
      COP: 4000.00,
      BRL: 5.00,
      CLP: 900.00,
      PEN: 3.75
    }
  };
}

// ====================================================================
// 💰 FUNCIÓN PRINCIPAL: CALCULAR PAGO AL INSTRUCTOR
// ====================================================================

/**
 * Calcula el pago completo para un instructor considerando:
 * - Impuestos de su país
 * - Comisión de la plataforma
 * - Comisión del método de pago
 * - Conversión de moneda
 * 
 * IMPORTANTE: saleAmountUSD YA INCLUYE IVA (es el precio final pagado por el cliente)
 * 
 * @param {Object} params
 * @param {Number} params.saleAmountUSD - Monto de la venta EN USD (CON IVA INCLUIDO)
 * @param {Number} params.platformCommissionRate - Comisión de la plataforma (%)
 * @param {Object} params.instructor - Objeto del instructor
 * @returns {Object} Desglose completo del pago
 */
export async function calculateInstructorPayout({
  saleAmountUSD,
  platformCommissionRate,
  instructor
}) {
  const country = instructor.country || 'INTL';
  const config = COUNTRY_CONFIGS[country] || COUNTRY_CONFIGS.INTL;
  
  // Obtener régimen fiscal del instructor
  const regimenFiscal = instructor.fiscal?.regimenFiscal || Object.keys(config.taxRegimes)[0];
  const taxRegime = config.taxRegimes[regimenFiscal];
  
  // Obtener método de pago preferido
  const paymentMethod = instructor.paymentMethod || config.defaultPaymentMethod;
  
  // Obtener tipos de cambio
  const exchangeRates = await getExchangeRates();
  const usdToTaxCurrency = exchangeRates.rates[config.taxCurrency];
  
  // ====================================================================
  // PASO 1: CONVERTIR VENTA A MONEDA FISCAL
  // ====================================================================
  
  const saleAmountTaxCurrency = saleAmountUSD * usdToTaxCurrency;
  
  // ====================================================================
  // PASO 2: APLICAR COMISIÓN DE LA PLATAFORMA
  // ====================================================================
  
  const platformCommissionAmount = (saleAmountTaxCurrency * platformCommissionRate) / 100;
  const amountAfterPlatformCommission = saleAmountTaxCurrency - platformCommissionAmount;
  
  // ====================================================================
  // PASO 3: CALCULAR IMPUESTOS (LA VENTA YA INCLUYE IVA)
  // ====================================================================
  
  let taxCalculations = {};
  
  if (country === 'MX') {
    // Para México, la venta YA incluye IVA del 16%
    // Necesitamos separar el IVA del subtotal
    
    const subtotalSinIVA = amountAfterPlatformCommission / 1.16; // Dividir entre 1.16 para obtener base
    const iva = amountAfterPlatformCommission - subtotalSinIVA; // El IVA es la diferencia
    
    // Retención de IVA (2/3 del IVA para RESICO y Honorarios)
    const retencionIVA = iva * (taxRegime.vatRetention || 0);
    
    // ISR (sobre subtotal sin IVA)
    let isrRate = 0;
    let isrAmount = 0;
    
    if (taxRegime.isrProgressive) {
      // RESICO: ISR progresivo según ingresos acumulados
      const ingresoAcumulado = instructor.fiscal?.ingresoAcumuladoAnual || 0;
      const nuevoAcumulado = ingresoAcumulado + subtotalSinIVA;
      
      for (const bracket of taxRegime.isrRates) {
        if (nuevoAcumulado <= bracket.limit) {
          isrRate = bracket.rate;
          break;
        }
      }
      
      isrAmount = (subtotalSinIVA * isrRate) / 100;
    } else {
      isrRate = taxRegime.isrRate || 0;
      isrAmount = (subtotalSinIVA * isrRate) / 100;
    }
    
    taxCalculations = {
      subtotalSinIVA,
      iva,
      ivaRate: config.vatRate * 100,
      retencionIVA,
      retencionIVARate: (taxRegime.vatRetention || 0) * 100,
      isrRate,
      isrAmount,
      totalTaxes: retencionIVA + isrAmount,
      ingresoAcumuladoAntes: instructor.fiscal?.ingresoAcumuladoAnual || 0,
      ingresoAcumuladoDespues: (instructor.fiscal?.ingresoAcumuladoAnual || 0) + subtotalSinIVA
    };
  } else if (country === 'ES') {
    // España: Retención IRPF del 15%
    const retencionIRPF = (amountAfterPlatformCommission * taxRegime.isrRate) / 100;
    
    taxCalculations = {
      base: amountAfterPlatformCommission,
      retencionIRPF,
      retencionIRPFRate: taxRegime.isrRate,
      totalTaxes: retencionIRPF
    };
  } else {
    // Otros países: Sin retenciones
    taxCalculations = {
      base: amountAfterPlatformCommission,
      totalTaxes: 0
    };
  }
  
  // ====================================================================
  // PASO 4: CALCULAR MONTO DESPUÉS DE IMPUESTOS
  // ====================================================================
  
  const amountAfterTaxes = amountAfterPlatformCommission - taxCalculations.totalTaxes;
  
  // ====================================================================
  // PASO 5: CONVERTIR A MONEDA DE PAGO (SI ES DIFERENTE)
  // ====================================================================
  
  const paymentMethodConfig = PAYMENT_FEES[paymentMethod];
  const paymentCurrency = instructor.fiscal?.cuentaBancaria?.currency || config.currency;
  
  let amountInPaymentCurrency = amountAfterTaxes;
  let taxCurrencyToPaymentCurrency = 1;
  
  if (paymentCurrency !== config.taxCurrency) {
    taxCurrencyToPaymentCurrency = exchangeRates.rates[paymentCurrency] / exchangeRates.rates[config.taxCurrency];
    amountInPaymentCurrency = amountAfterTaxes * taxCurrencyToPaymentCurrency;
  }
  
  // ====================================================================
  // PASO 6: APLICAR COMISIÓN DEL MÉTODO DE PAGO
  // ====================================================================
  
  const paymentFeeRate = paymentMethodConfig.rate;
  const paymentFeeFixed = paymentMethodConfig.fixed;
  
  const paymentFeeAmount = (amountInPaymentCurrency * paymentFeeRate) / 100 + paymentFeeFixed;
  const finalAmountToInstructor = amountInPaymentCurrency - paymentFeeAmount;
  
  // ====================================================================
  // RESULTADO FINAL
  // ====================================================================
  
  return {
    sale: {
      amountUSD: saleAmountUSD,
      amountTaxCurrency: saleAmountTaxCurrency,
      currency: config.taxCurrency,
      includesVAT: true // ✅ Confirmar que ya incluye IVA
    },
    
    platform: {
      commissionRate: platformCommissionRate,
      commissionAmount: platformCommissionAmount,
      currency: config.taxCurrency
    },
    
    tax: {
      country,
      regime: regimenFiscal,
      regimeName: taxRegime.name,
      currency: config.taxCurrency,
      ...taxCalculations
    },
    
    payment: {
      method: paymentMethod,
      methodName: getPaymentMethodName(paymentMethod),
      currency: paymentCurrency,
      feeRate: paymentFeeRate,
      feeFixed: paymentFeeFixed,
      feeAmount: paymentFeeAmount
    },
    
    exchangeRates: {
      USD_to_taxCurrency: usdToTaxCurrency,
      taxCurrency_to_paymentCurrency: taxCurrencyToPaymentCurrency,
      timestamp: exchangeRates.timestamp
    },
    
    summary: {
      totalInstructorReceives: finalAmountToInstructor,
      totalInstructorReceivesUSD: finalAmountToInstructor / (exchangeRates.rates[paymentCurrency]),
      currency: paymentCurrency,
      breakdown: {
        saleAmount: saleAmountTaxCurrency,
        platformCommission: -platformCommissionAmount,
        taxes: -taxCalculations.totalTaxes,
        paymentFee: -paymentFeeAmount,
        final: finalAmountToInstructor
      }
    }
  };
}

// ====================================================================
// 🔍 VALIDACIÓN DE LÍMITES FISCALES
// ====================================================================

/**
 * Valida si el instructor puede recibir el pago según límites fiscales
 * (Especialmente importante para RESICO en México)
 */
export function validateTaxLimits(instructor, amountToAdd) {
  const country = instructor.country || 'INTL';
  const config = COUNTRY_CONFIGS[country];
  
  if (!config) return { canContinue: true, alerts: [] };
  
  const regimenFiscal = instructor.fiscal?.regimenFiscal;
  const taxRegime = config.taxRegimes?.[regimenFiscal];
  
  if (!taxRegime || !taxRegime.annualLimit) {
    return { canContinue: true, alerts: [] };
  }
  
  const currentIncome = instructor.fiscal?.ingresoAcumuladoAnual || 0;
  const newTotal = currentIncome + amountToAdd;
  const limit = taxRegime.annualLimit;
  const percentage = (newTotal / limit) * 100;
  
  const alerts = [];
  
  // Alerta 80%
  if (percentage >= 80 && percentage < 90) {
    alerts.push({
      level: 'warning',
      percentage: percentage.toFixed(1),
      message: `Has alcanzado el ${percentage.toFixed(1)}% del límite anual de RESICO (${config.currency} ${limit.toLocaleString()}). Considera cambiar de régimen fiscal.`
    });
  }
  
  // Alerta 90%
  if (percentage >= 90 && percentage < 100) {
    alerts.push({
      level: 'danger',
      percentage: percentage.toFixed(1),
      message: `¡ALERTA! Has alcanzado el ${percentage.toFixed(1)}% del límite anual. Próximas ventas podrían exceder el límite de RESICO.`
    });
  }
  
  // Bloqueado 100%
  if (percentage >= 100) {
    return {
      canContinue: false,
      alerts: [{
        level: 'blocked',
        percentage: percentage.toFixed(1),
        message: `❌ Has excedido el límite anual de RESICO. No puedes recibir más pagos hasta el próximo año fiscal o cambiar de régimen.`
      }]
    };
  }
  
  return {
    canContinue: true,
    alerts
  };
}

// ====================================================================
// 🔄 RESETEO ANUAL DE INGRESOS
// ====================================================================

/**
 * Resetea los ingresos acumulados al inicio de un nuevo año fiscal
 */
export async function resetAnnualIncome(instructor) {
  const currentYear = new Date().getFullYear();
  
  if (instructor.fiscal?.anioFiscalActual !== currentYear) {
    instructor.fiscal.ingresoAcumuladoAnual = 0;
    instructor.fiscal.anioFiscalActual = currentYear;
    instructor.fiscal.alertaLimite80Enviada = false;
    instructor.fiscal.alertaLimite90Enviada = false;
    instructor.fiscal.bloqueadoPorLimite = false;
    instructor.fiscal.ultimaActualizacionIngresos = new Date();
    
    await instructor.save();
    
    console.log(`✅ Ingresos reseteados para ${instructor.name} - Año ${currentYear}`);
  }
}

// ====================================================================
// 🛠 UTILIDADES
// ====================================================================

function getPaymentMethodName(method) {
  const names = {
    paypal: 'PayPal',
    stripe: 'Stripe',
    wise: 'Wise',
    payoneer: 'Payoneer',
    bank_transfer: 'Transferencia Bancaria',
    oxxo: 'OXXO',
    sepa: 'SEPA'
  };
  return names[method] || method;
}

/**
 * Obtiene la configuración de un país
 */
export function getCountryConfig(countryCode) {
  return COUNTRY_CONFIGS[countryCode] || COUNTRY_CONFIGS.INTL;
}

/**
 * Lista todos los países soportados
 */
export function getSupportedCountries() {
  return Object.entries(COUNTRY_CONFIGS).map(([code, config]) => ({
    code,
    name: config.name,
    currency: config.currency,
    paymentMethods: config.paymentMethods
  }));
}

export default {
  calculateInstructorPayout,
  validateTaxLimits,
  resetAnnualIncome,
  getCountryConfig,
  getSupportedCountries,
  COUNTRY_CONFIGS,
  getExchangeRates
};
