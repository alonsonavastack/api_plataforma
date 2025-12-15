import mongoose from 'mongoose';
import InstructorEarnings from './models/InstructorEarnings.js';

/**
 * 🔧 Script para actualizar ganancias pending a available
 * Ejecutar: node fix-pending-earnings.js
 */

const MONGODB_URI = 'mongodb://127.0.0.1:27017/db_cursos';

async function fixPendingEarnings() {
    try {
        console.log('🔌 Conectando a MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado a MongoDB');

        // Buscar todas las ganancias en pending
        const pendingEarnings = await InstructorEarnings.find({ status: 'pending' });
        
        console.log(`\n📊 Ganancias encontradas en "pending": ${pendingEarnings.length}`);

        if (pendingEarnings.length === 0) {
            console.log('✅ No hay ganancias pending para actualizar');
            process.exit(0);
        }

        // Actualizar a available
        const result = await InstructorEarnings.updateMany(
            { status: 'pending' },
            { 
                $set: { 
                    status: 'available',
                    available_at: new Date() // Actualizar fecha a ahora
                } 
            }
        );

        console.log(`\n✅ Actualización completada:`);
        console.log(`   • Ganancias actualizadas: ${result.modifiedCount}`);
        console.log(`   • Estado nuevo: available`);
        console.log(`\n💡 Las ganancias ahora están disponibles para pago inmediato`);

        // Mostrar resumen por instructor
        const earningsByInstructor = await InstructorEarnings.aggregate([
            { $match: { status: 'available' } },
            { 
                $group: {
                    _id: '$instructor',
                    total: { $sum: '$instructor_earning' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } }
        ]);

        console.log(`\n📊 Resumen por instructor (ganancias disponibles):`);
        for (const item of earningsByInstructor) {
            console.log(`   • Instructor ${item._id}: $${item.total.toFixed(2)} (${item.count} items)`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixPendingEarnings();
