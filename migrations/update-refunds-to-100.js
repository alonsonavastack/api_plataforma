import mongoose from 'mongoose';
import Refund from '../models/Refund.js';

/**
 * 🔄 Migración: Actualizar cálculos de reembolsos a 100%
 * 
 * Este script actualiza todos los reembolsos existentes para que
 * muestren el 100% del monto original, ya que ahora se acredita
 * todo a la billetera digital sin deducciones.
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://agendador:123Alonso123@cluster0.uyzbe.mongodb.net/cursos';

async function migrateRefunds() {
    try {
        console.log('🔄 [Migration] Conectando a MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ [Migration] Conectado a MongoDB');

        // Obtener todos los reembolsos
        const refunds = await Refund.find({ state: 1 });
        console.log(`📊 [Migration] Encontrados ${refunds.length} reembolsos`);

        let updated = 0;
        let skipped = 0;

        for (const refund of refunds) {
            const originalAmount = refund.originalAmount;
            const currentRefundAmount = refund.calculations?.refundAmount || 0;

            // Si ya está al 100%, saltar
            if (currentRefundAmount === originalAmount) {
                skipped++;
                continue;
            }

            console.log(`\n💰 [Migration] Reembolso ${refund._id}`);
            console.log(`   Antes: $${currentRefundAmount} (${refund.calculations?.refundPercentage || 0}%)`);

            // Recalcular con la nueva lógica (100%)
            refund.calculateRefund();

            console.log(`   Después: $${refund.calculations.refundAmount} (${refund.calculations.refundPercentage}%)`);

            // Guardar
            await refund.save();
            updated++;
        }

        console.log(`\n✅ [Migration] Migración completada`);
        console.log(`   📝 Actualizados: ${updated}`);
        console.log(`   ⏭️  Omitidos: ${skipped}`);
        console.log(`   📊 Total: ${refunds.length}`);

        await mongoose.disconnect();
        console.log('👋 [Migration] Desconectado de MongoDB');

    } catch (error) {
        console.error('❌ [Migration] Error:', error);
        process.exit(1);
    }
}

// Ejecutar migración
console.log('🚀 [Migration] Iniciando migración de reembolsos...\n');
migrateRefunds()
    .then(() => {
        console.log('\n🎉 [Migration] Proceso completado exitosamente');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 [Migration] Error fatal:', error);
        process.exit(1);
    });
