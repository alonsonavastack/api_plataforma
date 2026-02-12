
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import PaymentSettings from '../models/PaymentSettings.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from api root
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ MONGO_URI is missing in .env");
    process.exit(1);
}

mongoose.connect(MONGO_URI).then(async () => {
    console.log('✅ MongoDB Connected');
    await testPayPal();
    mongoose.disconnect();
}).catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
});

async function testPayPal() {
    try {
        console.log('\n🔍 Fetching Payment Settings...');
        const paymentSettings = await PaymentSettings.findOne();

        if (!paymentSettings) {
            console.error('❌ No PaymentSettings found in DB');
            return;
        }

        const PAYPAL_MODE = paymentSettings.paypal?.mode || process.env.PAYPAL_MODE || 'sandbox';
        console.log(`ℹ️ Mode: ${PAYPAL_MODE}`);

        let clientId = '';
        let clientSecret = '';

        if (PAYPAL_MODE === 'sandbox') {
            clientId = paymentSettings.paypal?.sandbox?.clientId || process.env.PAYPAL_CLIENT_ID;
            clientSecret = paymentSettings.paypal?.sandbox?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
        } else {
            clientId = paymentSettings.paypal?.live?.clientId || process.env.PAYPAL_CLIENT_ID;
            clientSecret = paymentSettings.paypal?.live?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
        }

        console.log(`ℹ️ Client ID: ${clientId ? clientId.substring(0, 5) + '...' : 'MISSING'}`);
        console.log(`ℹ️ Client Secret: ${clientSecret ? '******' : 'MISSING'}`);

        if (!clientId || !clientSecret) {
            console.error('❌ Credentials missing!');
            return;
        }

        const PAYPAL_API = PAYPAL_MODE === 'sandbox' ? 'https://api.sandbox.paypal.com' : 'https://api.paypal.com';

        console.log(`\n🔄 Attempting to get Access Token from ${PAYPAL_API}...`);

        const tokenResponse = await axios({
            method: 'post',
            url: `${PAYPAL_API}/v1/oauth2/token`,
            auth: {
                username: clientId.trim(),
                password: clientSecret.trim()
            },
            params: { grant_type: 'client_credentials' },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const accessToken = tokenResponse.data.access_token;
        console.log('✅ Access Token retrieved successfully!');

        console.log('\n🔄 Attempting to Create Test Order...');
        const orderResponse = await axios({
            method: 'post',
            url: `${PAYPAL_API}/v2/checkout/orders`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            data: {
                intent: 'CAPTURE',
                purchase_units: [
                    {
                        amount: {
                            currency_code: 'MXN',
                            value: '100.00'
                        },
                        description: `Test Order ${Date.now()}`
                    }
                ],
                application_context: {
                    brand_name: process.env.SITE_NAME || 'Dev-Sharks',
                    landing_page: 'NO_PREFERENCE',
                    user_action: 'PAY_NOW',
                    return_url: (process.env.URL_FRONTEND || 'https://localhost:4200').replace(/\/$/, '') + '/',
                    cancel_url: (process.env.URL_FRONTEND || 'https://localhost:4200').replace(/\/$/, '') + '/'
                }
            }
        });

        console.log('✅ Order Created Successfully!');
        console.log(`   Order ID: ${orderResponse.data.id}`);
        console.log(`   Status: ${orderResponse.data.status}`);
        console.log('   Links:');
        orderResponse.data.links.forEach(link => {
            console.log(`     - ${link.rel}: ${link.href}`);
        });

    } catch (error) {
        console.error('\n❌ Error Testing PayPal:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('   Message:', error.message);
        }
    }
}
