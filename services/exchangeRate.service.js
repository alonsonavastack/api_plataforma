// services/exchangeRate.service.js

/**
 * 🌎 SERVICIO DE TIPO DE CAMBIO
 * 
 * SIMPLIFICADO: Solo soporta MXN (Pesos Mexicanos).
 * Se han eliminado las conversiones y llamadas a APIs externas.
 */

export const SUPPORTED_COUNTRIES = {
    'MX': { name: 'México', currency: 'MXN', symbol: '$', mercadopago_id: 'MLM' },
    'AR': { name: 'Argentina', currency: 'ARS', symbol: '$', mercadopago_id: 'MLA' },
    'BO': { name: 'Bolivia', currency: 'BOB', symbol: 'Bs.', mercadopago_id: 'MBO' },
    'CL': { name: 'Chile', currency: 'CLP', symbol: '$', mercadopago_id: 'MLC' },
    'CO': { name: 'Colombia', currency: 'COP', symbol: '$', mercadopago_id: 'MCO' },
    'CR': { name: 'Costa Rica', currency: 'CRC', symbol: '₡', mercadopago_id: 'MCR' },
    'CU': { name: 'Cuba', currency: 'CUP', symbol: '$', mercadopago_id: null },
    'EC': { name: 'Ecuador', currency: 'USD', symbol: '$', mercadopago_id: 'MEC' },
    'SV': { name: 'El Salvador', currency: 'USD', symbol: '$', mercadopago_id: 'MSV' },
    'ES': { name: 'España', currency: 'EUR', symbol: '€', mercadopago_id: null },
    'GT': { name: 'Guatemala', currency: 'GTQ', symbol: 'Q', mercadopago_id: 'MGT' },
    'HN': { name: 'Honduras', currency: 'HNL', symbol: 'L', mercadopago_id: 'MHN' },
    'NI': { name: 'Nicaragua', currency: 'NIO', symbol: 'C$', mercadopago_id: 'MNI' },
    'PA': { name: 'Panamá', currency: 'USD', symbol: '$', mercadopago_id: 'MPA' },
    'PY': { name: 'Paraguay', currency: 'PYG', symbol: '₲', mercadopago_id: 'MPY' },
    'PE': { name: 'Perú', currency: 'PEN', symbol: 'S/', mercadopago_id: 'MPE' },
    'DO': { name: 'República Dominicana', currency: 'DOP', symbol: 'RD$', mercadopago_id: 'MRD' },
    'UY': { name: 'Uruguay', currency: 'UYU', symbol: '$', mercadopago_id: 'MLU' },
    'VE': { name: 'Venezuela', currency: 'VES', symbol: 'Bs.', mercadopago_id: 'MVE' },
    'US': { name: 'Estados Unidos', currency: 'USD', symbol: '$', mercadopago_id: null }
};

/**
 * Obtener todos los tipos de cambio (Dummy)
 */
export async function getAllExchangeRates() {
    return { MXN: 1 };
}

/**
 * 🌎 CONVERTIR (Dummy - Retorna mismo valor en MXN)
 */
export async function convertUSDByCountry(amount, countryCode = 'MX') {
    return {
        usd: amount,
        amount: amount,
        currency: 'MXN',
        rate: 1,
        symbol: '$',
        country: 'México',
        mercadopago_id: 'MLM'
    };
}

/**
 * COMPATIBILIDAD: Legacy
 */
export async function convertUSDtoMXN(amount) {
    return {
        usd: amount,
        mxn: amount,
        rate: 1
    };
}

/**
 * Obtener tasa (siempre 1)
 */
export async function getExchangeRate() {
    return 1;
}

/**
 * 💰 FORMATEAR MONEDA
 */
export function formatCurrency(amount, currency = 'MXN') {
    return `$${Number(amount).toFixed(2)} MXN`;
}

/**
 * 🌎 OBTENER LISTA DE PAÍSES (Solo México o todos sin conversión)
 * Retornamos todos los países para que el selector funcione, pero sin conversión.
 */
export function getSupportedCountries() {
    return Object.keys(SUPPORTED_COUNTRIES).map(code => {
        const country = SUPPORTED_COUNTRIES[code];
        return {
            code,
            ...country,
            exchange_rate: 1 // Forzamos 1:1
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

export default {
    getAllExchangeRates,
    convertUSDByCountry,
    convertUSDtoMXN,
    getExchangeRate,
    formatCurrency,
    getSupportedCountries,
    SUPPORTED_COUNTRIES
};
