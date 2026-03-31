// Script de ejecución rápida de migración
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runMigration() {
    console.log('🚀 Ejecutando migración de reembolsos al 100%...\n');
    
    try {
        // Ejecutar el script de migración
        const { stdout, stderr } = await execAsync('node update-refunds-to-100.js', {
            cwd: '/Users/codfull-stack/Desktop/plataforma/api/migrations'
        });
        
        console.log(stdout);
        
        if (stderr) {
            console.error('Advertencias:', stderr);
        }
        
        console.log('\n✅ Migración completada exitosamente');
        console.log('\n📝 PRÓXIMOS PASOS:');
        console.log('1. Reinicia el backend si está corriendo (Ctrl+C y npm run dev)');
        console.log('2. Recarga el navegador con Hard Reload (Cmd/Ctrl + Shift + R)');
        console.log('3. Verifica la tabla de reembolsos en el dashboard');
        
    } catch (error) {
        console.error('❌ Error al ejecutar migración:', error.message);
        process.exit(1);
    }
}

runMigration();
