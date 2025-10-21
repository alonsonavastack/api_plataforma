import mongoose from 'mongoose';
import models from '../models/index.js';

// Destructurar modelos del index
const { InstructorEarnings } = models;


async function updateEarningsStatus() {
    const MONGO_URI = process.env.MONGO_URI;
    try {
        console.log('🔄 Conectando a MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado a MongoDB\n');

        const now = new Date();
        console.log(`📅 Fecha actual: ${now.toISOString()}\n`);

        // Buscar ganancias pendientes que ya pasaron su fecha de disponibilidad
        const earningsToUpdate = await InstructorEarnings.find({
            status: 'pending',
            available_at: { $lte: now }
        }).populate('instructor', 'name email');

        console.log(`📊 Ganancias a actualizar: ${earningsToUpdate.length}\n`);

        if (earningsToUpdate.length === 0) {
            console.log('✅ No hay ganancias pendientes para actualizar.');
            await mongoose.disconnect();
            return;
        }

        let updated = 0;
        let errors = 0;

        for (const earning of earningsToUpdate) {
            try {
                earning.status = 'available';
                await earning.save();

                console.log(`✅ Ganancia actualizada a disponible:`);
                console.log(`   - Instructor: ${earning.instructor.name} (${earning.instructor.email})`);
                console.log(`   - Monto: $${earning.instructor_earning.toFixed(2)}`);
                console.log(`   - Fecha ganada: ${earning.earned_at.toLocaleDateString()}`);
                console.log(`   - Disponible desde: ${earning.available_at.toLocaleDateString()}\n`);

                updated++;
            } catch (error) {
                console.error(`❌ Error actualizando ganancia ${earning._id}:`, error.message);
                errors++;
            }
        }

        console.log('\n============================================================');
        console.log('📊 RESUMEN DEL PROCESO');
        console.log('============================================================');
        console.log(`Total encontradas: ${earningsToUpdate.length}`);
        console.log(`Actualizadas exitosamente: ${updated}`);
        console.log(`Errores: ${errors}`);
        console.log('============================================================\n');

        // Mostrar estadísticas actuales
        const stats = await InstructorEarnings.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$instructor_earning' } } }
        ]);

        console.log('📈 ESTADÍSTICAS ACTUALES:\n');
        stats.forEach(s => {
            console.log(`   ${s._id}: ${s.count} ganancias ($${s.total.toFixed(2)})`);
        });

        console.log('\n✅ Proceso completado exitosamente');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
    }
}

updateEarningsStatus();
