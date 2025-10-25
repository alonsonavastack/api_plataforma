// Script para migrar clases existentes con vimeo_id a la nueva estructura
import mongoose from 'mongoose';
import CourseClase from '../models/CourseClase.js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

async function migrateVideoPlatform() {
  try {
    console.log('🚀 Iniciando migración de plataformas de video...\n');
    
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Contar clases con vimeo_id
    const classesWithVimeo = await CourseClase.countDocuments({
      vimeo_id: { $exists: true, $ne: null, $ne: '' }
    });
    
    console.log(`📊 Total de clases con vimeo_id: ${classesWithVimeo}\n`);

    if (classesWithVimeo === 0) {
      console.log('ℹ️  No hay clases para migrar. Todas las clases están actualizadas.\n');
      await mongoose.disconnect();
      return;
    }

    // Actualizar todas las clases que tienen vimeo_id
    const result = await CourseClase.updateMany(
      { 
        vimeo_id: { $exists: true, $ne: null, $ne: '' },
        video_platform: { $exists: false } // Solo actualizar si no tiene video_platform
      },
      { 
        $set: { 
          video_platform: 'vimeo'
        },
        $rename: {
          vimeo_id: 'video_id' // Renombrar vimeo_id a video_id
        }
      }
    );

    console.log(`✅ Migración completada:`);
    console.log(`   - Clases actualizadas: ${result.modifiedCount}`);
    console.log(`   - Clases ya migradas: ${classesWithVimeo - result.modifiedCount}\n`);

    // Verificar la migración
    const verifyVimeo = await CourseClase.countDocuments({ video_platform: 'vimeo' });
    const verifyYoutube = await CourseClase.countDocuments({ video_platform: 'youtube' });
    
    console.log('📈 Estado actual:');
    console.log(`   - Clases con Vimeo: ${verifyVimeo}`);
    console.log(`   - Clases con YouTube: ${verifyYoutube}`);
    console.log(`   - Total: ${verifyVimeo + verifyYoutube}\n`);
    
    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
    console.log('🎉 Migración finalizada con éxito\n');
    
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Ejecutar la migración
migrateVideoPlatform();
