import axios from 'axios';

/**
 * 💰 Servicio de Payouts de Mercado Pago
 * 
 * Maneja transferencias automáticas a instructores usando Mercado Pago
 * Soporta múltiples países latinoamericanos
 */

/**
 * Crear payout en Mercado Pago
 * @param {Object} params - Parámetros del payout
 * @param {number} params.amount - Monto en USD
 * @param {string} params.currency - Moneda (USD)
 * @param {Object} params.recipient - Datos del destinatario
 * @param {string} params.recipient.type - Tipo: 'email', 'phone', 'cvu'
 * @param {string} params.recipient.value - Valor de la cuenta
 * @param {string} params.recipient.country - País: MX, AR, CO, CL, PE, BR
 * @param {string} params.reference - Referencia externa
 * @returns {Promise<Object>} - Respuesta de Mercado Pago
 */
export async function createMercadoPagoPayout({ amount, currency, recipient, reference }) {
  try {
    // 1. Validar país soportado
    const supportedCountries = ['MX', 'AR', 'CO', 'CL', 'PE', 'BR'];
    if (!supportedCountries.includes(recipient.country)) {
      throw new Error(`País no soportado: ${recipient.country}`);
    }

    // 2. Obtener access token según país
    const accessToken = getAccessTokenByCountry(recipient.country);
    if (!accessToken) {
      throw new Error(`Access token no configurado para ${recipient.country}`);
    }

    // 3. Convertir monto a moneda local
    const localAmount = await convertToLocalCurrency(amount, currency, recipient.country);

    // 4. Obtener payment_method_id
    const paymentMethodId = getPaymentMethodId(recipient.type, recipient.country);

    // 5. Preparar request
    const requestData = {
      transaction_amount: localAmount.amount,
      currency_id: localAmount.currency,
      payment_method_id: paymentMethodId,
      external_reference: reference || `instructor-payout-${Date.now()}`,
      description: 'Pago de ganancias - Plataforma de Cursos',
      // Destinatario según tipo
      ...(recipient.type === 'email' && {
        email: recipient.value
      }),
      ...(recipient.type === 'phone' && {
        phone: {
          area_code: recipient.value.substring(0, 3),
          number: recipient.value.substring(3)
        }
      }),
      ...(recipient.type === 'cvu' && {
        cvu: recipient.value
      })
    };

    // 6. Hacer request a Mercado Pago
    console.log('🚀 Creando payout en Mercado Pago:', {
      country: recipient.country,
      amount: localAmount,
      type: recipient.type
    });

    const response = await axios.post(
      'https://api.mercadopago.com/v1/payouts',
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': reference || `${Date.now()}`
        }
      }
    );

    console.log('✅ Payout creado exitosamente:', response.data.id);

    return {
      success: true,
      id: response.data.id,
      status: response.data.status,
      transaction_amount: response.data.transaction_amount,
      currency_id: response.data.currency_id,
      external_reference: response.data.external_reference,
      date_created: response.data.date_created
    };

  } catch (error) {
    console.error('❌ Error en MP Payout:', error.response?.data || error.message);
    
    // Extraer mensaje de error útil
    const errorMessage = error.response?.data?.message 
      || error.response?.data?.error 
      || error.message;

    throw new Error(`Mercado Pago Error: ${errorMessage}`);
  }
}

/**
 * Consultar estado de payout
 * @param {string} payoutId - ID del payout en Mercado Pago
 * @param {string} country - País del payout
 * @returns {Promise<Object>} - Estado del payout
 */
export async function getMercadoPagoPayoutStatus(payoutId, country) {
  try {
    const accessToken = getAccessTokenByCountry(country);
    
    const response = await axios.get(
      `https://api.mercadopago.com/v1/payouts/${payoutId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    return {
      id: response.data.id,
      status: response.data.status,
      status_detail: response.data.status_detail,
      transaction_amount: response.data.transaction_amount,
      currency_id: response.data.currency_id
    };

  } catch (error) {
    console.error('Error al consultar payout:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Obtener access token según país
 * @private
 */
function getAccessTokenByCountry(country) {
  const tokens = {
    'MX': process.env.MP_ACCESS_TOKEN_MX,
    'AR': process.env.MP_ACCESS_TOKEN_AR,
    'CO': process.env.MP_ACCESS_TOKEN_CO,
    'CL': process.env.MP_ACCESS_TOKEN_CL,
    'PE': process.env.MP_ACCESS_TOKEN_PE,
    'BR': process.env.MP_ACCESS_TOKEN_BR
  };
  
  return tokens[country];
}

/**
 * Obtener payment_method_id según tipo y país
 * @private
 */
function getPaymentMethodId(type, country) {
  // Mercado Pago usa 'account_money' para transferencias a cuentas
  const methods = {
    'MX': { 
      email: 'account_money', 
      phone: 'account_money' 
    },
    'AR': { 
      email: 'account_money', 
      cvu: 'account_money' 
    },
    'CO': { 
      email: 'account_money', 
      phone: 'account_money' 
    },
    'CL': { 
      email: 'account_money', 
      phone: 'account_money' 
    },
    'PE': { 
      email: 'account_money', 
      phone: 'account_money' 
    },
    'BR': { 
      email: 'account_money', 
      phone: 'account_money' 
    }
  };
  
  return methods[country]?.[type] || 'account_money';
}

/**
 * Convertir USD a moneda local
 * @private
 */
async function convertToLocalCurrency(amount, fromCurrency, toCountry) {
  // Tasas de cambio aproximadas (en producción, usar API de tasas)
  const exchangeRates = {
    'MX': { currency: 'MXN', rate: 17.5 },
    'AR': { currency: 'ARS', rate: 350 },
    'CO': { currency: 'COP', rate: 4000 },
    'CL': { currency: 'CLP', rate: 900 },
    'PE': { currency: 'PEN', rate: 3.7 },
    'BR': { currency: 'BRL', rate: 5.0 }
  };

  const countryData = exchangeRates[toCountry];
  
  if (!countryData) {
    throw new Error(`No exchange rate for country: ${toCountry}`);
  }

  if (fromCurrency === 'USD') {
    return {
      amount: Math.round(amount * countryData.rate * 100) / 100,
      currency: countryData.currency
    };
  }

  return { amount, currency: fromCurrency };
}

/**
 * Validar límites de transacción por país
 */
export function validateTransactionLimits(amount, country) {
  const limits = {
    'MX': { max: 50000, currency: 'MXN' },
    'AR': { max: 200000, currency: 'ARS' },
    'CO': { max: 10000000, currency: 'COP' },
    'CL': { max: 5000000, currency: 'CLP' },
    'PE': { max: 20000, currency: 'PEN' },
    'BR': { max: 25000, currency: 'BRL' }
  };

  const limit = limits[country];
  if (!limit) return { valid: true };

  return {
    valid: amount <= limit.max,
    max: limit.max,
    currency: limit.currency
  };
}

export default {
  createMercadoPagoPayout,
  getMercadoPagoPayoutStatus,
  validateTransactionLimits
};
