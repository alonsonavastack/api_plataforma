import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PlatformCommissionSettings from './models/PlatformCommissionSettings.js';
import InstructorEarnings from './models/InstructorEarnings.js';
import Sale from './models/Sale.js';
import { updateEarningsStatusJob } from './cron/updateEarningsStatus.js';

dotenv.config();

let dbUrl = process.env.MONGO_URI;

if (process.env.NODE_ENV === 'development' && process.env.MONGO_URILOCAL) {
    dbUrl = process.env.MONGO_URILOCAL;
}

const fixPendingEarnings = async () => {
    try {
        await mongoose.connect(dbUrl);
        console.log(`✅ Conectado a MongoDB.`);

        console.log('\n--- Recalculando fechas para ganancias pendientes ---\n');

        const settings = await PlatformCommissionSettings.findOne().sort({ createdAt: -1 });
        const daysUntilAvailable = settings?.days_until_available !== undefined ? settings.days_until_available : 7;

        console.log(`⚙️  Configuración actual: ${daysUntilAvailable} días de espera.`);

        const pendingEarnings = await InstructorEarnings.find({ status: 'pending' });
        console.log(`📊 Se encontraron ${pendingEarnings.length} ganancias pendientes.`);

        let updatedCount = 0;

        for (const earning of pendingEarnings) {
            const earnedAt = new Date(earning.earned_at);
            const currentAvailableAt = new Date(earning.available_at);

            // 🔥 REFERIDOS: Días de espera es 0
            const dynamicDaysUntilAvailable = earning.is_referral ? 0 : daysUntilAvailable;

            // Calcular nueva fecha SIN los 7 días fijos (o 0 si es referido)
            const newAvailableAt = new Date(earnedAt);
            newAvailableAt.setDate(newAvailableAt.getDate() + dynamicDaysUntilAvailable);

            // Solo actualizar si la fecha cambia significativamente
            if (Math.abs(newAvailableAt.getTime() - currentAvailableAt.getTime()) > 60000) {
                console.log(`🔄 Actualizando Ganancia ID: ${earning._id}`);
                console.log(`   - Fecha original: ${currentAvailableAt.toISOString()}`);
                console.log(`   - Nueva fecha:    ${newAvailableAt.toISOString()}`);

                earning.available_at = newAvailableAt;
                await earning.save();
                updatedCount++;
            }
        }

        console.log(`\n✅ Se actualizaron fechas de ${updatedCount} ganancias.`);

        if (updatedCount > 0 || pendingEarnings.length > 0) {
            console.log('\n--- Verificando si alguna debe cambiar a "available" ahora ---\n');
            await updateEarningsStatusJob();
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nProceso finalizado.');
    }
};

fixPendingEarnings();
