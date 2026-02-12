
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PaymentSettings from '../models/PaymentSettings.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

console.log('Connecting to MongoDB...');
console.log('URI:', process.env.MONGO_URI ? 'Defined' : 'Undefined');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('MongoDB connected');
    try {
        const settings = await PaymentSettings.findOne();
        console.log('PaymentSettings found:', JSON.stringify(settings, null, 2));

        console.log('ENV PAYPAL_MODE:', process.env.PAYPAL_MODE);
        console.log('ENV PAYPAL_CLIENT_ID (first 5 chars):', process.env.PAYPAL_CLIENT_ID ? process.env.PAYPAL_CLIENT_ID.substring(0, 5) : 'N/A');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.disconnect();
    }
}).catch(err => console.error(err));
