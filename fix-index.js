// Script temporal para limpiar el índice corrupto
// Ejecutar con: node fix-index.js
// Este archivo se puede eliminar después de ejecutarlo

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/plataforma_cursos';

async function fixIndex() {
    try {
        console.log('🔌 Conectando a MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado a MongoDB');

        const db = mongoose.connection.db;
        const coursesCollection = db.collection('courses');

        // Listar índices actuales
        console.log('\n📋 Índices actuales:');
        const indexes = await coursesCollection.indexes();
        indexes.forEach(index => {
            console.log(`  - ${index.name}`);
        });

        // Intentar eliminar el índice corrupto
        console.log('\n🗑️  Eliminando índice corrupto "search_text_index"...');
        try {
            await coursesCollection.dropIndex('search_text_index');
            console.log('✅ Índice "search_text_index" eliminado exitosamente');
        } catch (error) {
            if (error.code === 27 || error.codeName === 'IndexNotFound') {
                console.log('⚠️  El índice no existía o ya fue eliminado');
            } else {
                throw error;
            }
        }

        // Listar índices después de eliminar
        console.log('\n📋 Índices después de limpiar:');
        const indexesAfter = await coursesCollection.indexes();
        indexesAfter.forEach(index => {
            console.log(`  - ${index.name}`);
        });

        console.log('\n✅ Limpieza completada. Ahora reinicia el servidor para recrear los índices correctamente.');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Desconectado de MongoDB');
        process.exit(0);
    }
}

fixIndex();
