
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PlatformCommissionSettings from './models/PlatformCommissionSettings.js';
import InstructorEarnings from './models/InstructorEarnings.js';
import Sale from './models/Sale.js'; // Import Sale to register schema
import { updateEarningsStatusJob } from './cron/updateEarningsStatus.js';

// Cargar variables de entorno
dotenv.config();

// Determinar qué URI usar (Forzar Producción para corregir datos reales del usuario)
const MONGO_URI = "mongodb+srv://agendador:123Alonso123@cluster0.uyzbe.mongodb.net/cursos";

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log(`MongoDB Connected to PRODUCTION (Explicit)`);
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1);
    }
};

const recalculateAvailability = async () => {
    await connectDB();

    console.log('\n--- Recalculating Availability Dates ---\n');

    try {
        // 1. Obtener configuración actual
        const settings = await PlatformCommissionSettings.findOne().sort({ createdAt: -1 });
        const daysUntilAvailable = settings?.days_until_available !== undefined ? settings.days_until_available : 7;

        console.log(`Current Setting: ${daysUntilAvailable} days until available.`);

        // 2. Buscar/Diagnosticar ganancias específicas
        console.log('DEBUG: Diagnosing specific earning 698e32fc...');
        const targetId = '698e32fc4f2412c93b1872c5';
        const targetEarning = await InstructorEarnings.findById(targetId).populate('sale');

        if (targetEarning) {
            console.log(`TARGET EARNING:`);
            console.log(` - Status: ${targetEarning.status}`);
            console.log(` - Available: ${targetEarning.available_at}`);

            if (targetEarning.sale) {
                console.log(`ASSOCIATED SALE:`);
                console.log(` - ID: ${targetEarning.sale._id}`);
                console.log(` - Status: ${targetEarning.sale.status}`);
                console.log(` - Refunded: ${targetEarning.sale.has_refund}`);

                // FIX: Si la venta es válida (status 'completado' o 'approved' o similar) y NO tiene refund
                // Entonces forzamos el earning a 'available' según petición del usuario
                if (targetEarning.status === 'refunded' && !targetEarning.sale.has_refund) {
                    console.log('⚠️ MISMATCH: Earning is REFUNDED but Sale is NOT refunded.');
                    console.log('⚡ FORCE FIX: Setting earning to AVAILABLE immediately.');

                    targetEarning.status = 'available';
                    targetEarning.available_at = new Date(); // Available NOW
                    await targetEarning.save();
                    console.log('✅ Fixed target earning.');
                } else if (targetEarning.status === 'pending') {
                    console.log('⚡ FORCE UPDATE: Setting pending earning to AVAILABLE immediately based on 0 days setting.');
                    targetEarning.status = 'available';
                    targetEarning.available_at = new Date();
                    await targetEarning.save();
                    console.log('✅ Updated target earning.');
                }
            } else {
                console.log('❌ Sale not found for this earning.');
            }
        } else {
            console.log('❌ Target earning not found.');
        }

        // Original section for all earnings (kept for context, but the new block is inserted before the pendingEarnings query)
        console.log('DEBUG: Querying ALL earnings...');
        const allEarnings = await InstructorEarnings.find({});
        console.log(`Found ${allEarnings.length} total earnings.`);

        allEarnings.forEach(e => {
            console.log(` - ID: ${e._id} | Status: ${e.status} | Earned: ${e.earned_at} | Available: ${e.available_at} | Sale: ${e.sale}`);
        });

        const pendingEarnings = await InstructorEarnings.find({ status: 'pending' });
        console.log(`Found ${pendingEarnings.length} pending earnings.`);

        if (pendingEarnings.length === 0) {
            console.log('No pending earnings to update.');
            // process.exit(0);
        }

        let updatedCount = 0;

        for (const earning of pendingEarnings) {
            const earnedAt = new Date(earning.earned_at);
            const currentAvailableAt = new Date(earning.available_at);

            // Calcular nueva fecha
            const newAvailableAt = new Date(earnedAt);
            newAvailableAt.setDate(newAvailableAt.getDate() + daysUntilAvailable);

            // Solo actualizar si la fecha es diferente (margen de 1 min por segundos)
            if (Math.abs(newAvailableAt.getTime() - currentAvailableAt.getTime()) > 60000) {
                console.log(`Updating Earning ID: ${earning._id}`);
                console.log(`   Earned: ${earnedAt.toISOString()}`);
                console.log(`   Old Available: ${currentAvailableAt.toISOString()}`);
                console.log(`   New Available: ${newAvailableAt.toISOString()}`);

                earning.available_at = newAvailableAt;
                await earning.save();
                updatedCount++;
            }
        }

        console.log(`\nUpdated availability dates for ${updatedCount} earnings.`);

        // 3. Ejecutar job para verificar si ahora están disponibles
        if (updatedCount > 0 || pendingEarnings.length > 0) {
            console.log('\n--- Running Status Update Job ---\n');
            await updateEarningsStatusJob();
        }

    } catch (error) {
        console.error('Error calculating availability:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDone.');
    }
};

recalculateAvailability();
