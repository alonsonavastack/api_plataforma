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
        const settings = await PaymentSettings.findOne();
        if (!settings) {
            console.log('No settings found');
            return;
        }

        console.log('Settings found:', JSON.stringify(settings, null, 2));
        console.log('Attempting to save...');
        settings.updatedAt = new Date();
        await settings.save();
        console.log('SUCCESS✅ - Saved settings without error.');
    } catch (error) {
        console.error('ERROR❌ - Failed to save:', error.message);
        if (error.errors) {
            console.log("Validation errors:", Object.keys(error.errors).map(k => `${k}: ${error.errors[k].message}`));
        }
    } finally {
        mongoose.disconnect();
    }
});
