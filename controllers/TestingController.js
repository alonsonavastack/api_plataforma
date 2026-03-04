import { convertUSDByCountry, formatCurrency, SUPPORTED_COUNTRIES } from '../services/exchangeRate.service.js';

/**
 * 🧪 CONTROLADOR DE TESTING - SOLO DESARROLLO
 * Permite probar conversiones de moneda para diferentes países
 */

export default {
    /**
     * 🌎 PROBAR CONVERSIÓN PARA TODOS LOS PAÍSES
     * GET /api/testing/test-conversion?amount=50
     */
    testConversionAllCountries: async (req, res) => {
        try {
            const amount = parseFloat(req.query.amount) || 50;

            console.log(`\n🧪 [TESTING] Probando conversión de $${amount} USD para todos los países`);

            const results = [];

            for (const [code, config] of Object.entries(SUPPORTED_COUNTRIES)) {
                try {
                    const conversion = await convertUSDByCountry(amount, code);

                    results.push({
                        country: config.name,
                        code: code,
                        flag: getCountryFlag(code),
                        original_usd: amount,
                        converted_amount: conversion.amount,
                        currency: conversion.currency,
                        symbol: conversion.symbol,
                        exchange_rate: conversion.rate,
                        formatted: formatCurrency(conversion.amount, conversion.currency),
                        mercadopago_id: conversion.mercadopago_id
                    });

                    console.log(`   ✅ ${config.name}: ${formatCurrency(conversion.amount, conversion.currency)}`);

                } catch (error) {
                    console.error(`   ❌ Error en ${config.name}:`, error.message);
                    results.push({
                        country: config.name,
                        code: code,
                        error: error.message
                    });
                }
            }

            res.status(200).json({
                success: true,
                amount_usd: amount,
                timestamp: new Date().toISOString(),
                results: results
            });

        } catch (error) {
            console.error('❌ [TESTING] Error:', error);
            res.status(500).json({
                success: false,
                message: 'Error al probar conversiones',
                error: error.message
            });
        }
    },

    /**
     * 🧪 SIMULAR PREFERENCIA DE MERCADOPAGO PARA CUALQUIER PAÍS
     * POST /api/testing/simulate-preference
     * Body: { country: 'AR', amount: 50, product_name: 'Curso de Testing' }
     */
    simulateMercadoPagoPreference: async (req, res) => {
        try {
            const { country, amount, product_name } = req.body;

            if (!country || !amount) {
                return res.status(400).json({
                    success: false,
                    message: 'Se requiere country y amount'
                });
            }

            console.log(`\n🧪 [TESTING] Simulando preferencia de MercadoPago`);
            console.log(`   🌎 País: ${country}`);
            console.log(`   💰 Monto: $${amount} USD`);

            // Validar país soportado
            if (!SUPPORTED_COUNTRIES[country]) {
                return res.status(400).json({
                    success: false,
                    message: `País no soportado: ${country}`,
                    supported_countries: Object.keys(SUPPORTED_COUNTRIES)
                });
            }

            // Convertir
            const conversion = await convertUSDByCountry(amount, country);

            // Simular estructura de preferencia
            const simulatedPreference = {
                items: [{
                    title: product_name || 'Producto de Prueba',
                    unit_price: conversion.amount,
                    quantity: 1,
                    currency_id: conversion.currency
                }],
                payer: {
                    email: 'test@example.com',
                    name: 'Usuario de Prueba'
                },
                back_urls: {
                    success: 'http://localhost:4200/payment-success',
                    failure: 'http://localhost:4200/payment-failure'
                },
                metadata: {
                    country: country,
                    original_amount_usd: amount,
                    converted_amount: conversion.amount,
                    currency: conversion.currency
                }
            };

            console.log(`   ✅ Conversión: ${formatCurrency(conversion.amount, conversion.currency)}`);
            console.log(`   💱 Tipo de cambio: 1 USD = ${conversion.rate} ${conversion.currency}`);

            res.status(200).json({
                success: true,
                message: '✅ Simulación exitosa - Esta es la preferencia que se enviaría a MercadoPago',
                country_info: {
                    name: SUPPORTED_COUNTRIES[country].name,
                    code: country,
                    flag: getCountryFlag(country),
                    currency: conversion.currency,
                    symbol: conversion.symbol
                },
                conversion: {
                    amount_usd: amount,
                    amount_local: conversion.amount,
                    exchange_rate: conversion.rate,
                    formatted_usd: formatCurrency(amount, 'USD'),
                    formatted_local: formatCurrency(conversion.amount, conversion.currency)
                },
                simulated_preference: simulatedPreference,
                note: '⚠️ Esto es una simulación. No se creó ninguna preferencia real en MercadoPago.'
            });

        } catch (error) {
            console.error('❌ [TESTING] Error:', error);
            res.status(500).json({
                success: false,
                message: 'Error al simular preferencia',
                error: error.message
            });
        }
    },

    /**
     * 🧪 SIMULAR TRANSFERENCIA PARA CUALQUIER PAÍS
     * POST /api/testing/simulate-transfer
     * Body: { country: 'BR', amount: 50 }
     */
    simulateTransfer: async (req, res) => {
        try {
            const { country, amount } = req.body;

            if (!country || !amount) {
                return res.status(400).json({
                    success: false,
                    message: 'Se requiere country y amount'
                });
            }

            console.log(`\n🧪 [TESTING] Simulando transferencia`);
            console.log(`   🌎 País: ${country}`);
            console.log(`   💰 Monto: $${amount} USD`);

            // Validar país
            if (!SUPPORTED_COUNTRIES[country]) {
                return res.status(400).json({
                    success: false,
                    message: `País no soportado: ${country}`,
                    supported_countries: Object.keys(SUPPORTED_COUNTRIES)
                });
            }

            // Convertir
            const conversion = await convertUSDByCountry(amount, country);

            // Datos bancarios simulados por país
            const bankDetailsByCountry = {
                'MX': {
                    bank_name: 'BBVA México',
                    account_holder: 'Tu Empresa México S.A. de C.V.',
                    account_number: '1234567890',
                    clabe: '012345678901234567',
                    swift: 'BCMRMXMM'
                },
                'AR': {
                    bank_name: 'Banco Galicia',
                    account_holder: 'Tu Empresa Argentina S.A.',
                    cbu: '0123456789012345678901',
                    alias: 'TU.EMPRESA.AR'
                },
                'BR': {
                    bank_name: 'Banco do Brasil',
                    account_holder: 'Sua Empresa Brasil LTDA',
                    agencia: '1234',
                    conta: '56789-0',
                    pix: 'seupix@email.com'
                },
                'CL': {
                    bank_name: 'Banco de Chile',
                    account_holder: 'Tu Empresa Chile SpA',
                    cuenta_corriente: '123456789',
                    rut: '12.345.678-9'
                },
                'CO': {
                    bank_name: 'Bancolombia',
                    account_holder: 'Tu Empresa Colombia S.A.S.',
                    cuenta_ahorros: '12345678901',
                    nit: '900.123.456-7'
                },
                'PE': {
                    bank_name: 'BCP - Banco de Crédito del Perú',
                    account_holder: 'Tu Empresa Perú S.A.C.',
                    cuenta_corriente: '1234567890123',
                    cci: '00212345678901234567'
                },
                'UY': {
                    bank_name: 'Banco República',
                    account_holder: 'Tu Empresa Uruguay S.A.',
                    numero_cuenta: '1234567890',
                    swift: 'BROUUYMM'
                }
            };

            const bankDetails = bankDetailsByCountry[country] || bankDetailsByCountry['MX'];

            console.log(`   ✅ Conversión: ${formatCurrency(conversion.amount, conversion.currency)}`);

            res.status(200).json({
                success: true,
                message: '✅ Simulación de transferencia exitosa',
                country_info: {
                    name: SUPPORTED_COUNTRIES[country].name,
                    code: country,
                    flag: getCountryFlag(country),
                    currency: conversion.currency,
                    symbol: conversion.symbol
                },
                payment_info: {
                    amount_usd: amount,
                    amount_local: conversion.amount,
                    currency: conversion.currency,
                    exchange_rate: conversion.rate,
                    formatted_usd: formatCurrency(amount, 'USD'),
                    formatted_local: formatCurrency(conversion.amount, conversion.currency)
                },
                bank_details: bankDetails,
                instructions: [
                    `1. Realiza una transferencia por ${formatCurrency(conversion.amount, conversion.currency)}`,
                    `2. Usa como referencia: TXN-${Date.now()}`,
                    `3. Sube tu comprobante de pago`,
                    `4. Espera la aprobación del administrador`
                ],
                note: '⚠️ Esto es una simulación. Los datos bancarios son de ejemplo.'
            });

        } catch (error) {
            console.error('❌ [TESTING] Error:', error);
            res.status(500).json({
                success: false,
                message: 'Error al simular transferencia',
                error: error.message
            });
        }
    },

    /**
     * 🧪 COMPARAR PRECIOS EN TODOS LOS PAÍSES
     * GET /api/testing/compare-prices?amount=50
     */
    comparePrices: async (req, res) => {
        try {
            const amount = parseFloat(req.query.amount) || 50;

            const comparisons = [];

            for (const [code, config] of Object.entries(SUPPORTED_COUNTRIES)) {
                const conversion = await convertUSDByCountry(amount, code);
                comparisons.push({
                    country: config.name,
                    flag: getCountryFlag(code),
                    price: formatCurrency(conversion.amount, conversion.currency),
                    rate: conversion.rate
                });
            }

            // Ordenar por monto convertido (para ver cuál es más barato/caro)
            comparisons.sort((a, b) => {
                const aAmount = parseFloat(a.price.replace(/[^0-9.-]/g, ''));
                const bAmount = parseFloat(b.price.replace(/[^0-9.-]/g, ''));
                return aAmount - bAmount;
            });

            res.status(200).json({
                success: true,
                base_price_usd: `$${amount} USD`,
                comparisons: comparisons,
                note: 'Precios ordenados de menor a mayor valor numérico (no necesariamente más barato)'
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * 🧪 DUMP EARNINGS
     * GET /api/testing/dump-earnings
     */
    dumpEarnings: async (req, res) => {
        try {
            const { default: models } = await import('../models/index.js');
            const recentEarnings = await models.InstructorEarnings.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('sale')
                .lean();

            const sales = await models.Sale.find({ is_referral: true })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            res.status(200).json({ earnings, latest_referral_sales: sales });
        } catch (error) {
            console.error('Error in dumpEarnings:', error);
            res.status(500).json({ error: error.message });
        }
    }
};

/**
 * Helper: Obtener emoji de bandera por código de país
 */
function getCountryFlag(countryCode) {
    const flags = {
        'MX': '🇲🇽',
        'AR': '🇦🇷',
        'BR': '🇧🇷',
        'CL': '🇨🇱',
        'CO': '🇨🇴',
        'PE': '🇵🇪',
        'UY': '🇺🇾'
    };
    return flags[countryCode] || '🌎';
}
