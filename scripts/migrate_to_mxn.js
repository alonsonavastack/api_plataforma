
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// dotenv removed, using --env-file


const MAX_RETRIES = 3;

async function connectDB() {
    let retries = 0;
    while (retries < MAX_RETRIES) {
        try {
            const dbUrl = process.env.DB_URL || 'mongodb://localhost:27017/cursos_online'; // Fallback
            await mongoose.connect(dbUrl);
            console.log('✅ Connected to MongoDB');
            return;
        } catch (error) {
            retries++;
            console.error(`❌ Connection attempt ${retries} failed:`, error.message);
            if (retries === MAX_RETRIES) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

async function migrate() {
    try {
        await connectDB();

        console.log('🚀 Starting migration to MXN only...');

        // 1. Migrate Projects
        console.log('📦 Migrating Projects...');
        const projectsResult = await mongoose.connection.collection('projects').updateMany(
            { price_usd: { $exists: true } },
            { $rename: { 'price_usd': 'price_mxn' } }
        );
        console.log(`   - Renamed price_usd to price_mxn in ${projectsResult.modifiedCount} projects`);

        // 2. Migrate Courses
        console.log('📚 Migrating Courses...');
        const coursesResult = await mongoose.connection.collection('courses').updateMany(
            { price_usd: { $exists: true } },
            { $rename: { 'price_usd': 'price_mxn' } }
        );
        console.log(`   - Renamed price_usd to price_mxn in ${coursesResult.modifiedCount} courses`);

        // 3. Clean up Sales
        console.log('💰 Cleaning up Sales...');
        const salesResult = await mongoose.connection.collection('sales').updateMany(
            {},
            {
                $unset: {
                    price_dolar: "",
                    total_mxn: "",
                    conversion_rate: "",
                    conversion_currency: "",
                    conversion_amount: "",
                    conversion_country: ""
                },
                $set: {
                    currency_total: 'MXN',
                    currency_payment: 'MXN'
                }
            }
        );
        console.log(`   - Removed conversion fields from ${salesResult.modifiedCount} sales`);

        console.log('✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
    }
}

migrate();
