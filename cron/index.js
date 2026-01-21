import { scheduleUpdateEarningsStatus } from './updateEarningsStatus.js';


/**
 * ÍNDICE DE CRON JOBS
 * 
 * Este archivo centraliza todos los trabajos programados (CRON jobs)
 * de la aplicación.
 * 
 * Para agregar un nuevo CRON job:
 * 1. Crear archivo en /api/cron/nombreDelJob.js
 * 2. Importarlo aquí
 * 3. Agregarlo al array cronJobs
 * 4. Llamar su función de inicio en initializeCronJobs()
 */

// Array para almacenar referencias a los jobs activos
const activeCronJobs = [];

/**
 * Inicializar todos los CRON jobs
 */
export function initializeCronJobs() {
    console.log('\n🚀 ============================================');
    console.log('   INICIALIZANDO CRON JOBS');
    console.log('============================================\n');

    try {
        // Job 1: Actualización de estado de ganancias
        const earningsStatusJob = scheduleUpdateEarningsStatus();
        activeCronJobs.push({
            name: 'Update Earnings Status',
            job: earningsStatusJob,
            schedule: 'Daily at 00:00'
        });



        // Aquí puedes agregar más CRON jobs en el futuro
        // Ejemplo:
        // const anotherJob = scheduleAnotherJob();
        // activeCronJobs.push({
        //     name: 'Another Job',
        //     job: anotherJob,
        //     schedule: 'Every hour'
        // });

        console.log(`\n✅ Total de CRON jobs activos: ${activeCronJobs.length}`);
        console.log('============================================\n');

        return activeCronJobs;
    } catch (error) {
        console.error('❌ Error al inicializar CRON jobs:', error);
        throw error;
    }
}

/**
 * Detener todos los CRON jobs
 * Útil para testing o para apagar la aplicación limpiamente
 */
export function stopAllCronJobs() {
    console.log('\n⏹️  Deteniendo todos los CRON jobs...');

    activeCronJobs.forEach(({ name, job }) => {
        if (job && typeof job.stop === 'function') {
            job.stop();
            console.log(`   ✓ Detenido: ${name}`);
        }
    });

    // Limpiar el array
    activeCronJobs.length = 0;

    console.log('✅ Todos los CRON jobs detenidos.\n');
}

/**
 * Obtener lista de CRON jobs activos
 */
export function getActiveCronJobs() {
    return activeCronJobs.map(({ name, schedule }) => ({
        name,
        schedule,
        status: 'active'
    }));
}

/**
 * Reiniciar todos los CRON jobs
 */
export function restartCronJobs() {
    console.log('\n🔄 Reiniciando CRON jobs...');
    stopAllCronJobs();
    initializeCronJobs();
}

export default {
    initializeCronJobs,
    stopAllCronJobs,
    getActiveCronJobs,
    restartCronJobs
};
