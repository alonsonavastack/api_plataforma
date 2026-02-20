import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PaymentSettings from '../models/PaymentSettings.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        console.log('--- CLEANING PAYMENT SETTINGS DB ---');

        // Find all documents
        const allSettings = await PaymentSettings.find();
        console.log(`Found ${allSettings.length} documents in payment_settings collection.`);

        if (allSettings.length > 0) {
            console.log('Deleting all existing settings to start clean...');
            await PaymentSettings.deleteMany({});
            console.log('✅ Deleted all documents.');
        }

        // Create the single default document
        const newSettings = await PaymentSettings.create({
            stripe: { mode: 'test', active: true, secretKey: '', publishableKey: '', webhookSecret: '' }
        });

        console.log('✅ Clean default Stripe settings document created:', newSettings._id);

    } catch (error) {
        console.error('ERROR❌:', error.message);
    } finally {
        mongoose.disconnect();
    }
});
