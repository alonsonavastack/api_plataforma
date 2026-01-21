
/**
 * 🌎 SERVICIO DE TIPO DE CAMBIO
 * 
 * SIMPLIFICADO: Solo soporta MXN (Pesos Mexicanos).
 * Se han eliminado las conversiones y llamadas a APIs externas.
 */

export const SUPPORTED_COUNTRIES = {
    'MX': { name: 'México', currency: 'MXN', symbol: '$', mercadopago_id: 'MLM' },
    // Mantengo otros países por compatibilidad, pero todos forzados a MXN/USD
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
 * Se usa tasa 1 para no alterar el valor numérico si el sistema ya opera en MXN
 */
export async function convertUSDByCountry(amount, countryCode = 'MX') {
    return {
        usd: amount,
        amount: amount,
        currency: 'MXN',
        rate: 1, // Mantenemos 1 para que el cobro sea el mismo valor que el 'total'
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
 * Obtener tasa para MOSTRAR en frontend
 * Retornamos 20.50 como valor referencial si se pide explicitamente
 */
export async function getExchangeRate() {
    return 20.50;
}

/**
 * 💰 FORMATEAR MONEDA
 */
export function formatCurrency(amount, currency = 'MXN') {
    return `$${Number(amount).toFixed(2)} ${currency}`;
}

/**
 * 🌎 OBTENER LISTA DE PAÍSES
 */
export function getSupportedCountries() {
    return Object.keys(SUPPORTED_COUNTRIES).map(code => {
        const country = SUPPORTED_COUNTRIES[code];
        return {
            code,
            ...country,
            exchange_rate: 20.50 // Valor referecial
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
