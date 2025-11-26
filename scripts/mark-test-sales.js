import mongoose from 'mongoose';
import Sale from '../models/Sale.js';

// No need for dotenv if running with --env-file .env
// If running without it, we might need to read .env manually or assume env vars are set.
// Given the user's environment, we will assume --env-file usage or manual .env reading if that fails.

// Manual .env reading fallback
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const envPath = path.resolve(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf8');
        envConfig.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        });
    }
} catch (e) {
    console.log('⚠️ No se pudo leer .env manual, asumiendo variables de entorno ya cargadas.');
}

async function markTestSales() {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error('MONGODB_URI no está definida');
        }

        await mongoose.connect(uri);
        console.log('✅ Conectado a MongoDB');

        // Marcar todas las ventas antes del 1 de diciembre como prueba
        const result = await Sale.updateMany(
            {
                createdAt: { $lt: new Date('2024-12-01') }
            },
            {
                $set: {
                    isTest: true,
                    testReason: 'Pre-launch testing - marked automatically'
                }
            }
        );

        console.log(`✅ ${result.modifiedCount} ventas marcadas como prueba`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

markTestSales();
