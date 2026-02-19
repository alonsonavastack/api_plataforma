import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * 🔗 Crear una cuenta Express para un instructor nuevo
 * Se llama cuando el instructor quiere vincular Stripe por primera vez
 */
export async function createConnectedAccount(instructor) {
    const account = await stripe.accounts.create({
        type: 'express',
        email: instructor.email,
        capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
            instructor_id: instructor._id.toString(),
            platform: 'devhubsharks'
        }
    });

    return account;
}

/**
 * 🔗 Generar link de onboarding para que el instructor vincule su cuenta
 * Redirige al instructor al formulario de Stripe
 */
export async function createOnboardingLink(stripeAccountId) {
    const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${process.env.URL_FRONTEND}/instructor/stripe/reauth`,
        return_url: `${process.env.URL_FRONTEND}/instructor/stripe/success`,
        type: 'account_onboarding',
    });

    return accountLink.url;
}

/**
 * ✅ Verificar si la cuenta del instructor está activa y lista para recibir pagos
 */
export async function checkAccountStatus(stripeAccountId) {
    const account = await stripe.accounts.retrieve(stripeAccountId);

    return {
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        requirements: account.requirements?.currently_due || []
    };
}

/**
 * 💳 Crear un PaymentIntent con split automático
 * - amount_total: monto total en centavos (ej: 100000 = $1,000 MXN)
 * - platform_fee: comisión de la plataforma en centavos (ej: 20000 = $200 MXN)
 * - instructor_stripe_id: el stripe account id del instructor
 * - currency: 'mxn' por defecto
 */
export async function createPaymentIntentWithSplit({ amount_total, platform_fee, instructor_stripe_id, currency = 'mxn', metadata = {} }) {
    const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount_total), // en centavos
        currency,
        application_fee_amount: Math.round(platform_fee), // comisión que queda en tu cuenta
        transfer_data: {
            destination: instructor_stripe_id, // va directo a la cuenta del instructor
        },
        metadata
    });

    return paymentIntent;
}

/**
 * 🔁 Generar link para que el instructor vea su dashboard de Stripe
 */
export async function createDashboardLink(stripeAccountId) {
    const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
    return loginLink.url;
}

/**
 * 🔔 Verificar firma de webhook de Stripe
 */
export function constructWebhookEvent(payload, signature) {
    return stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
    );
}

export default stripe;
