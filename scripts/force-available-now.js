import mongoose from 'mongoose';
import models from '../models/index.js';

const { PlatformCommissionSettings, InstructorEarnings } = models;

const MONGO_URI = process.env.MONGO_URI;

async function forceAvailableNow() {
    try {
        console.log('🔄 Conectando a MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado a MongoDB\n');

        // Actualizar configuración a 0 días
        const settings = await PlatformCommissionSettings.findOne();
        if (settings) {
            settings.days_until_available = 0;
            await settings.save();
            console.log('✅ Configuración actualizada: días hasta disponible = 0\n');
        }

        // Actualizar todas las ganancias pendientes a disponible
        const pendingEarnings = await InstructorEarnings.find({ status: 'pending' });
        
        console.log(`📊 Ganancias pendientes encontradas: ${pendingEarnings.length}\n`);

        let updated = 0;
        for (const earning of pendingEarnings) {
            earning.status = 'available';
            earning.available_at = new Date(); // Disponible ahora
            await earning.save();
            
            console.log(`✅ Ganancia actualizada a disponible:`);
            console.log(`   - Monto: $${earning.instructor_earning.toFixed(2)}`);
            console.log(`   - Curso: ${earning.course}`);
            
            updated++;
        }

        console.log('\n============================================================');
        console.log('✅ PROCESO COMPLETADO');
        console.log('============================================================');
        console.log(`Total actualizadas: ${updated}`);
        console.log('Ahora las ganancias están DISPONIBLES inmediatamente');
        console.log('============================================================\n');

        // Mostrar estadísticas
        const stats = await InstructorEarnings.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$instructor_earning' } } }
        ]);

        console.log('📈 ESTADÍSTICAS ACTUALES:\n');
        stats.forEach(s => {
            console.log(`   ${s._id}: ${s.count} ganancias ($${s.total.toFixed(2)})`);
        });

        console.log('\n🎉 Ahora refresca el navegador y verás los instructores!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
    }
}

forceAvailableNow();
