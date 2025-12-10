import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import models from '../models/index.js';
import { processPaidSale } from '../services/SaleService.js';
import { notifyPaymentApproved } from '../services/telegram.service.js'; // 🔥 IMPORTAR TELEGRAM
import { formatCurrency } from '../services/exchangeRate.service.js'; // 🔥 IMPORTAR CONVERSIÓN MULTI-PAÍS

// Configurar cliente de Mercado Pago
const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    options: { timeout: 5000 }
});

export default {
    createPreference: async (req, res) => {
        try {
            const { items, user_id, n_transaccion, total_amount, payer_email, payer_name, sale_details, currency_payment, country } = req.body;

            console.log('💳 [MercadoPagoController] Creando preferencia');
            console.log('   🎯 user_id:', user_id);
            console.log('   💵 total:', total_amount);
            console.log('   📑 n_transaccion:', n_transaccion);
            console.log('   🌎 país:', country || 'MX (default)');

            const urlFrontend = process.env.URL_FRONTEND || 'http://localhost:4200';
            const urlBackend = process.env.URL_BACKEND || 'http://localhost:3000';

            const preference = new Preference(client);

            // 🔥 DETERMINAR EMAIL SEGÚN MODO
            const isTestMode = process.env.MERCADOPAGO_ENV === 'development';
            let finalEmail = payer_email;

            if (isTestMode) {
                // En modo test, usar un email de usuario de prueba válido
                // Mercado Pago NO permite que el vendedor se pague a sí mismo
                finalEmail = 'test_user_46542293@testuser.com'; // 🔥 Usuario de prueba genérico
                console.log('🧪 [TEST MODE] Usando email de prueba para evitar "seller paying seller":', finalEmail);
            }

            console.log('📧 [MercadoPagoController] Datos del comprador:', {
                name: payer_name,
                email: finalEmail
            });

            // 🔥 ENTORNO DIRECTO EN PESOS MEXICANOS (MXN)
            // Se elimina la conversión ya que la plataforma base ahora es MXN

            const preferenceData = {
                body: {
                    items: items.map(item => ({
                        id: item.type === 'course' ? `COURSE-${item.title}` : `PROJECT-${item.title}`,
                        title: item.title,
                        quantity: 1,
                        unit_price: Number(total_amount), // 🔥 EL PRECIO YA VIENE EN MXN
                        currency_id: 'MXN', // 🔥 SIEMPRE MXN
                        description: `Compra en Plataforma: ${item.title}`,
                        picture_url: undefined
                    })),
                    payer: {
                        name: payer_name.split(' ')[0] || 'Comprador',
                        surname: payer_name.split(' ').slice(1).join(' ') || '',
                        email: finalEmail
                    },
                    back_urls: {
                        success: `${urlFrontend}/payment-success`,
                        failure: `${urlFrontend}/payment-failure`,
                        pending: `${urlFrontend}/payment-failure`
                    },
                    // auto_return: 'approved', // ❌ DESHABILITADO: No funciona con localhost en sandbox
                    external_reference: n_transaccion, // 🔥 Usar n_transaccion como referencia
                    notification_url: `${urlBackend}/api/mercadopago/webhook`,
                    metadata: {
                        user_id: user_id,
                        n_transaccion: n_transaccion,
                        sale_details: JSON.stringify(sale_details), // 🔥 Guardar detalles para crear venta
                        currency_payment: 'MXN',
                        total: total_amount,
                        country: 'MX', // 🔥 Siempre México como base
                        local_amount: total_amount,
                        local_currency: 'MXN'
                    },
                    payment_methods: {
                        excluded_payment_types: [
                            { id: "ticket" },
                            { id: "atm" },
                            { id: "bank_transfer" }
                        ]
                    }
                }
            };

            console.log('📦 [MercadoPagoController] Items:', preferenceData.body.items);
            console.log('🔗 [MercadoPagoController] Back URLs:', preferenceData.body.back_urls);

            const result = await preference.create(preferenceData);

            console.log('✅ [MercadoPagoController] Preferencia creada exitosamente');
            console.log('   🆔 Preference ID:', result.id);
            console.log('   🔗 Init Point:', result.init_point);

            res.status(200).json({
                success: true,
                init_point: result.init_point,
                preference_id: result.id
            });

        } catch (error) {
            console.error('❌ [MercadoPagoController] Error al crear preferencia:', error);

            // Log detallado del error
            if (error.cause) {
                console.error('   🔍 Causa:', JSON.stringify(error.cause, null, 2));
            }
            if (error.message) {
                console.error('   💬 Mensaje:', error.message);
            }

            res.status(500).json({
                success: false,
                message: 'Error al crear preferencia de Mercado Pago',
                error: error.message,
                details: error.cause || 'Sin detalles adicionales'
            });
        }
    },

    webhook: async (req, res) => {
        const paymentId = req.query.id || req.query['data.id'];
        const topic = req.query.topic || req.query.type;

        console.log(`\n🔔 [MercadoPagoController] Webhook recibido`);
        console.log(`   📌 Topic: ${topic}`);
        console.log(`   🆔 Payment ID: ${paymentId}`);

        try {
            if (topic === 'payment' && paymentId) {
                const payment = new Payment(client);
                const paymentData = await payment.get({ id: paymentId });

                console.log(`   💰 Estado del pago: ${paymentData.status}`);
                console.log(`   🆔 Referencia externa (n_transaccion): ${paymentData.external_reference}`);

                if (paymentData.status === 'approved') {
                    const n_transaccion = paymentData.external_reference;
                    const metadata = paymentData.metadata;

                    console.log(`   💾 Metadata recibido:`, metadata);

                    // 🔥 Verificar si la venta ya existe (debe existir desde el register())
                    let sale = await models.Sale.findOne({ n_transaccion });

                    if (sale) {
                        console.log(`   ✅ Venta encontrada: ${sale._id} (status: ${sale.status})`);

                        // Actualizar estado si no estaba pagado
                        if (sale.status !== 'Pagado') {
                            console.log(`   🔄 Actualizando venta de ${sale.status} a Pagado...`);

                            sale.status = 'Pagado';
                            // 🔥 Mantener el método original (mixed_mercadopago o mercadopago)
                            if (!sale.method_payment.includes('mercadopago')) {
                                sale.method_payment = 'mercadopago';
                            }
                            await sale.save();

                            await processPaidSale(sale, sale.user);

                            // 🔥 NOTIFICAR A TELEGRAM
                            await sale.populate('user');
                            notifyPaymentApproved(sale).catch(err =>
                                console.error('⚠️ Error al enviar notificación de Telegram:', err)
                            );

                            console.log(`   ✅ Venta actualizada a Pagado y notificación enviada`);
                        } else {
                            console.log(`   ℹ️ Venta ya estaba pagada. Sin cambios.`);
                        }
                    } else {
                        // 🚨 CASO EDGE: La venta NO existe (no debería pasar con las correcciones)
                        console.log(`   ⚠️ ALERTA: Venta no existía. Creando ahora...`);

                        const saleDetails = JSON.parse(metadata.sale_details || '[]');

                        sale = await models.Sale.create({
                            user: metadata.user_id,
                            method_payment: 'mercadopago',
                            currency_payment: metadata.currency_payment || 'USD',
                            n_transaccion: n_transaccion,
                            detail: saleDetails,
                            price_dolar: parseFloat(metadata.total),
                            total: parseFloat(metadata.total),
                            status: 'Pagado',
                            wallet_amount: parseFloat(metadata.wallet_amount || 0),
                            remaining_amount: 0
                        });

                        console.log(`   ✅ Venta creada exitosamente: ${sale._id}`);

                        await processPaidSale(sale, sale.user);

                        await sale.populate('user');
                        notifyPaymentApproved(sale).catch(err =>
                            console.error('⚠️ Error al enviar notificación de Telegram:', err)
                        );

                        console.log(`   ✅ Accesos activados y notificación enviada`);
                    }
                }
            }
            res.sendStatus(200);
        } catch (error) {
            console.error('❌ [MercadoPagoController] Error en webhook:', error);
            res.sendStatus(500);
        }
    },

    getPaymentStatus: async (req, res) => {
        res.status(501).json({ message: 'Not implemented' });
    },

    // 🔧 ENDPOINT TEMPORAL PARA DESARROLLO: Simular webhook manualmente
    simulateWebhook: async (req, res) => {
        try {
            const { payment_id } = req.body;

            console.log(`🛠️ [SIMULATE] Simulando webhook para payment_id: ${payment_id}`);

            const payment = new Payment(client);
            const paymentData = await payment.get({ id: payment_id });

            console.log(`   💰 Estado del pago: ${paymentData.status}`);
            console.log(`   🆔 Referencia externa: ${paymentData.external_reference}`);

            if (paymentData.status === 'approved') {
                const n_transaccion = paymentData.external_reference;
                const metadata = paymentData.metadata;

                let sale = await models.Sale.findOne({ n_transaccion });

                if (!sale) {
                    const saleDetails = JSON.parse(metadata.sale_details || '[]');

                    sale = await models.Sale.create({
                        user: metadata.user_id,
                        method_payment: 'mercadopago',
                        currency_payment: metadata.currency_payment || 'USD',
                        n_transaccion: n_transaccion,
                        detail: saleDetails,
                        price_dolar: parseFloat(metadata.total),
                        total: parseFloat(metadata.total),
                        status: 'Pagado'
                    });

                    await processPaidSale(sale, sale.user);

                    await sale.populate('user'); // 🔥 Poblar usuario
                    notifyPaymentApproved(sale).catch(console.error);

                    console.log(`   ✅ Venta creada: ${sale._id}`);

                    res.status(200).json({
                        success: true,
                        message: 'Venta creada exitosamente',
                        sale_id: sale._id
                    });
                } else {
                    res.status(200).json({
                        success: true,
                        message: 'La venta ya existía',
                        sale_id: sale._id
                    });
                }
            } else {
                res.status(400).json({
                    success: false,
                    message: `Pago no aprobado. Estado: ${paymentData.status}`
                });
            }
        } catch (error) {
            console.error('❌ [SIMULATE] Error:', error);
            res.status(500).json({
                success: false,
                message: 'Error al simular webhook',
                error: error.message
            });
        }
    },

    /**
     * 🔍 VERIFICAR PAGO MANUALMENTE
     * Este endpoint es llamado por el frontend en la página de éxito
     * para asegurar que la venta se cree incluso si el webhook falla.
     */
    verifyPayment: async (req, res) => {
        const { payment_id } = req.body;

        console.log(`\n🔍 [MercadoPagoController] Verificando pago manualmente: ${payment_id}`);

        if (!payment_id) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere payment_id'
            });
        }

        try {
            const payment = new Payment(client);
            const paymentData = await payment.get({ id: payment_id });

            console.log(`   💰 Estado del pago: ${paymentData.status}`);
            console.log(`   🆔 Referencia externa: ${paymentData.external_reference}`);

            if (paymentData.status === 'approved') {
                const n_transaccion = paymentData.external_reference;
                const metadata = paymentData.metadata;

                // Verificar si la venta ya existe
                let sale = await models.Sale.findOne({ n_transaccion });

                if (sale) {
                    console.log(`   ℹ️ Venta ya existe: ${sale._id}`);

                    if (sale.status !== 'Pagado') {
                        console.log(`   🔄 Actualizando a Pagado...`);
                        sale.status = 'Pagado';
                        sale.method_payment = 'mercadopago';
                        await sale.save();
                        await processPaidSale(sale, sale.user);

                        // 🔥 NOTIFICAR A TELEGRAM
                        await sale.populate('user');
                        notifyPaymentApproved(sale).catch(err =>
                            console.error('⚠️ Error al enviar notificación de Telegram:', err)
                        );
                    }

                    return res.status(200).json({
                        success: true,
                        message: 'Pago verificado y venta actualizada',
                        sale: sale
                    });
                } else {
                    // Crear la venta si no existe
                    console.log(`   🆕 Venta no encontrada. Creando ahora...`);

                    const saleDetails = JSON.parse(metadata.sale_details || '[]');

                    sale = await models.Sale.create({
                        user: metadata.user_id,
                        method_payment: 'mercadopago',
                        currency_payment: metadata.currency_payment || 'USD',
                        n_transaccion: n_transaccion,
                        detail: saleDetails,
                        price_dolar: parseFloat(metadata.total),
                        total: parseFloat(metadata.total),
                        status: 'Pagado'
                    });

                    console.log(`   ✅ Venta creada exitosamente: ${sale._id}`);

                    // Activar accesos
                    await processPaidSale(sale, sale.user);

                    // 🔥 NOTIFICAR A TELEGRAM
                    await sale.populate('user');
                    notifyPaymentApproved(sale).catch(err =>
                        console.error('⚠️ Error al enviar notificación de Telegram:', err)
                    );

                    return res.status(200).json({
                        success: true,
                        message: 'Pago verificado y venta creada',
                        sale: sale
                    });
                }
            } else {
                console.log(`   ⚠️ Pago no aprobado: ${paymentData.status}`);
                return res.status(200).json({
                    success: false,
                    message: `El pago no está aprobado. Estado: ${paymentData.status}`,
                    status: paymentData.status
                });
            }

        } catch (error) {
            console.error('❌ [MercadoPagoController] Error al verificar pago:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al verificar el pago',
                error: error.message
            });
        }
    }
};
