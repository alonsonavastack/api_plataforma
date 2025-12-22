import mongoose from 'mongoose';
import models from './models/index.js';
import TaxBreakdownService from './services/TaxBreakdownService.js';

// Conexión a BD (Simulada/Hardcoded para el script o tomada de env)
// Nota: Ejecutar con: node --env-file .env backfill_tax.js
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cursos_mean_v2';

async function backfill() {
    try {
        console.log('🔌 Conectando a MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado.');

        console.log('🔍 Buscando ganancias de instructores sin desglose fiscal...');

        // 1. Obtener todas las ganancias (historico)
        const earnings = await models.InstructorEarnings.find({
            status: { $ne: 'refunded' } // Ignoramos reembolsadas por ahora
        }).populate('sale');

        console.log(`📊 Encontradas ${earnings.length} ganancias totales.`);

        let processed = 0;
        let skipped = 0;

        for (const earning of earnings) {
            // 2. Verificar si ya tiene retención
            const existingRetention = await models.InstructorRetention.findOne({ earning: earning._id });

            if (existingRetention) {
                // console.log(`   ⏭️ Ganancia ${earning._id} ya tiene retención. Saltando.`);
                skipped++;
                continue;
            }

            if (!earning.sale) {
                console.warn(`   ⚠️ Ganancia ${earning._id} no tiene venta asociada. Saltando.`);
                continue;
            }

            // 3. Calcular desglose
            console.log(`   🔄 Procesando Venta ${earning.sale._id} / Earning ${earning._id}...`);
            await TaxBreakdownService.calculateBreakdown(earning.sale, earning);
            processed++;
        }

        console.log('\n🏁 Backfill completado.');
        console.log(`   ✅ Procesados: ${processed}`);
        console.log(`   ⏭️ Saltados (ya existían): ${skipped}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    }
}

backfill();
