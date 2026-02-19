import {
    createConnectedAccount,
    createOnboardingLink,
    checkAccountStatus,
    createDashboardLink,
    constructWebhookEvent
} from '../services/stripe.service.js';
import InstructorPaymentConfig from '../models/InstructorPaymentConfig.js';

/**
 * 🔗 PASO 1: El instructor inicia el proceso de vinculación con Stripe
 * POST /api/stripe/connect/onboard
 * 
 * Si ya tiene cuenta Stripe → genera nuevo link de onboarding
 * Si no tiene → crea la cuenta y genera el link
 */
export const startOnboarding = async (req, res) => {
    try {
        const instructor = req.user;

        let config = await InstructorPaymentConfig.findOne({ instructor: instructor._id });
        if (!config) {
            config = await InstructorPaymentConfig.create({ instructor: instructor._id });
        }

        let stripeAccountId = config.stripe_account_id;

        // Si no tiene cuenta Stripe aún, la creamos
        if (!stripeAccountId) {
            const account = await createConnectedAccount(instructor);
            stripeAccountId = account.id;

            config.stripe_account_id = stripeAccountId;
            await config.save();

            console.log(`✅ Cuenta Stripe creada para instructor ${instructor._id}: ${stripeAccountId}`);
        }

        // Generar link de onboarding
        const onboardingUrl = await createOnboardingLink(stripeAccountId);

        res.json({
            success: true,
            onboarding_url: onboardingUrl,
            message: 'Redirige al instructor a esta URL para completar su perfil en Stripe'
        });

    } catch (error) {
        console.error('❌ Error en startOnboarding:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ✅ PASO 2: Stripe redirige aquí después del onboarding
 * GET /api/stripe/connect/success
 * 
 * Verificamos si la cuenta quedó activa y actualizamos el estado en BD
 */
export const onboardingSuccess = async (req, res) => {
    try {
        const instructor = req.user;

        const config = await InstructorPaymentConfig.findOne({ instructor: instructor._id });
        if (!config || !config.stripe_account_id) {
            return res.status(400).json({ success: false, message: 'No se encontró cuenta Stripe vinculada' });
        }

        // Verificar estado real de la cuenta en Stripe
        const status = await checkAccountStatus(config.stripe_account_id);

        config.stripe_onboarding_complete = status.details_submitted;
        config.stripe_charges_enabled = status.charges_enabled;
        config.stripe_payouts_enabled = status.payouts_enabled;

        if (status.charges_enabled) {
            config.preferred_payment_method = 'stripe';
        }

        await config.save();

        console.log(`✅ Onboarding completado para instructor ${instructor._id}:`, status);

        res.json({
            success: true,
            stripe_ready: status.charges_enabled && status.payouts_enabled,
            status,
            message: status.charges_enabled
                ? '¡Cuenta Stripe lista para recibir pagos!'
                : 'Cuenta creada pero faltan datos por completar en Stripe'
        });

    } catch (error) {
        console.error('❌ Error en onboardingSuccess:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 📊 Obtener el estado de la cuenta Stripe del instructor
 * GET /api/stripe/connect/status
 */
export const getStripeStatus = async (req, res) => {
    try {
        const instructor = req.user;

        const config = await InstructorPaymentConfig.findOne({ instructor: instructor._id });

        if (!config || !config.stripe_account_id) {
            return res.json({
                success: true,
                connected: false,
                message: 'No has vinculado tu cuenta Stripe todavía'
            });
        }

        // Sincronizar estado con Stripe en tiempo real
        const status = await checkAccountStatus(config.stripe_account_id);

        // Actualizar en BD si hay cambios
        if (config.stripe_charges_enabled !== status.charges_enabled ||
            config.stripe_payouts_enabled !== status.payouts_enabled) {
            config.stripe_charges_enabled = status.charges_enabled;
            config.stripe_payouts_enabled = status.payouts_enabled;
            config.stripe_onboarding_complete = status.details_submitted;
            await config.save();
        }

        res.json({
            success: true,
            connected: true,
            stripe_account_id: config.stripe_account_id,
            charges_enabled: status.charges_enabled,
            payouts_enabled: status.payouts_enabled,
            onboarding_complete: status.details_submitted,
            pending_requirements: status.requirements
        });

    } catch (error) {
        console.error('❌ Error en getStripeStatus:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 🔗 Obtener link al dashboard de Stripe del instructor
 * GET /api/stripe/connect/dashboard
 */
export const getStripeDashboardLink = async (req, res) => {
    try {
        const instructor = req.user;

        const config = await InstructorPaymentConfig.findOne({ instructor: instructor._id });
        if (!config || !config.stripe_account_id) {
            return res.status(400).json({ success: false, message: 'No tienes cuenta Stripe vinculada' });
        }

        const dashboardUrl = await createDashboardLink(config.stripe_account_id);

        res.json({ success: true, dashboard_url: dashboardUrl });

    } catch (error) {
        console.error('❌ Error en getStripeDashboardLink:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 🔔 Webhook de Stripe — Stripe llama aquí cuando ocurren eventos
 * POST /api/stripe/webhook
 * 
 * IMPORTANTE: Esta ruta debe recibir el body RAW (sin parsear como JSON)
 * Configúrala en tu router ANTES de express.json()
 */
export const stripeWebhook = async (req, res) => {
    const signature = req.headers['stripe-signature'];

    let event;
    try {
        event = constructWebhookEvent(req.body, signature);
    } catch (err) {
        console.error('❌ Webhook Stripe - Firma inválida:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`🔔 Stripe Webhook recibido: ${event.type}`);

    switch (event.type) {
        case 'account.updated': {
            // Una cuenta conectada actualizó su información
            const account = event.data.object;
            await InstructorPaymentConfig.findOneAndUpdate(
                { stripe_account_id: account.id },
                {
                    stripe_charges_enabled: account.charges_enabled,
                    stripe_payouts_enabled: account.payouts_enabled,
                    stripe_onboarding_complete: account.details_submitted,
                }
            );
            console.log(`✅ Cuenta ${account.id} actualizada: charges=${account.charges_enabled}`);
            break;
        }

        case 'payment_intent.succeeded': {
            // Pago exitoso — aquí puedes activar la venta si usas Stripe como método de pago
            const paymentIntent = event.data.object;
            console.log(`💰 PaymentIntent exitoso: ${paymentIntent.id} - ${paymentIntent.amount / 100} ${paymentIntent.currency.toUpperCase()}`);
            break;
        }

        case 'payment_intent.payment_failed': {
            const paymentIntent = event.data.object;
            console.log(`❌ Pago fallido: ${paymentIntent.id}`);
            break;
        }

        default:
            console.log(`ℹ️ Evento no manejado: ${event.type}`);
    }

    res.json({ received: true });
};
