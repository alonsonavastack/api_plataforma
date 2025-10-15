import cron from 'node-cron';
import InstructorEarnings from '../models/InstructorEarnings.js';

/**
 * CRON JOB: Actualizar estado de ganancias (earnings)
 * 
 * Se ejecuta diariamente a las 00:00 (medianoche)
 * 
 * Función:
 * - Busca todas las ganancias con status='pending'
 * - Verifica si la fecha available_at ya pasó
 * - Cambia el status a 'available' si ya están listas para pago
 * 
 * Expresión CRON: '0 0 * * *'
 * - Minuto: 0
 * - Hora: 0 (medianoche)
 * - Día del mes: * (todos)
 * - Mes: * (todos)
 * - Día de la semana: * (todos)
 */

/**
 * Función principal que actualiza el estado de las ganancias
 */
export async function updateEarningsStatusJob() {
    try {
        const now = new Date();
        
        console.log(`[${now.toISOString()}] 🔄 Iniciando actualización de estado de ganancias...`);

        // Buscar ganancias pendientes cuya fecha available_at ya pasó
        const earningsToUpdate = await InstructorEarnings.find({
            status: 'pending',
            available_at: { $lte: now }
        });

        if (earningsToUpdate.length === 0) {
            console.log(`[${now.toISOString()}] ℹ️  No hay ganancias para actualizar.`);
            return {
                success: true,
                updated: 0,
                message: 'No hay ganancias para actualizar'
            };
        }

        console.log(`[${now.toISOString()}] 📊 Encontradas ${earningsToUpdate.length} ganancias para actualizar.`);

        // Actualizar el estado a 'available'
        const result = await InstructorEarnings.updateMany(
            {
                status: 'pending',
                available_at: { $lte: now }
            },
            {
                $set: { status: 'available' }
            }
        );

        console.log(`[${now.toISOString()}] ✅ Se actualizaron ${result.modifiedCount} ganancias a estado 'available'.`);

        // Log detallado de las ganancias actualizadas (opcional, para debugging)
        if (result.modifiedCount > 0) {
            const updatedEarnings = await InstructorEarnings.find({
                _id: { $in: earningsToUpdate.map(e => e._id) }
            }).populate('instructor', 'name email');

            console.log('📋 Detalle de ganancias actualizadas:');
            updatedEarnings.forEach(earning => {
                console.log(`   - Instructor: ${earning.instructor?.name} | Monto: $${earning.instructor_earning} | Curso: ${earning.course}`);
            });
        }

        return {
            success: true,
            updated: result.modifiedCount,
            message: `${result.modifiedCount} ganancias actualizadas exitosamente`
        };

    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error al actualizar estado de ganancias:`, error);
        return {
            success: false,
            updated: 0,
            error: error.message
        };
    }
}

/**
 * Configuración del CRON job
 * Se ejecuta todos los días a medianoche (00:00)
 */
export function scheduleUpdateEarningsStatus() {
    // Expresión CRON: '0 0 * * *' = Todos los días a las 00:00
    // Para testing, puedes usar: '*/5 * * * *' = Cada 5 minutos
    const cronExpression = '0 0 * * *'; // Diario a medianoche

    const task = cron.schedule(cronExpression, async () => {
        console.log('\n🕐 ============================================');
        console.log('   CRON JOB: Actualización de earnings');
        console.log('============================================');
        
        await updateEarningsStatusJob();
        
        console.log('============================================\n');
    }, {
        scheduled: true,
        timezone: "America/Mexico_City" // Ajusta a tu zona horaria
    });

    console.log('✅ CRON Job programado: Actualización de estado de ganancias');
    console.log(`   Frecuencia: Diario a las 00:00 (${cronExpression})`);
    console.log(`   Zona horaria: America/Mexico_City`);
    
    return task;
}

/**
 * Ejecutar manualmente el job (útil para testing)
 * Puedes llamar esta función desde cualquier lugar para forzar una actualización
 */
export async function runManually() {
    console.log('\n⚡ Ejecutando actualización manual de earnings...\n');
    const result = await updateEarningsStatusJob();
    console.log('\n✅ Actualización manual completada:', result);
    return result;
}

export default {
    scheduleUpdateEarningsStatus,
    updateEarningsStatusJob,
    runManually
};
