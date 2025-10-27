// Script para corregir el formato de teléfono en la base de datos
// Ejecutar este script una sola vez para corregir los teléfonos existentes

import mongoose from 'mongoose';
import models from './api/models/index.js';

async function fixPhoneFormats() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/neocourse');
        console.log('✅ Conectado a MongoDB');

        // Buscar usuarios con teléfonos que empiecen con '+'
        const usersWithPlusPhone = await models.User.find({
            phone: { $regex: /^\+/ }
        });

        console.log(`📱 Encontrados ${usersWithPlusPhone.length} usuarios con formato incorrecto de teléfono`);

        // Corregir cada usuario
        for (const user of usersWithPlusPhone) {
            const oldPhone = user.phone;
            const newPhone = oldPhone.replace('+', ''); // Quitar el '+'
            
            await models.User.findByIdAndUpdate(user._id, { phone: newPhone });
            console.log(`✅ Usuario ${user.email}: ${oldPhone} → ${newPhone}`);
        }

        console.log('🎉 Todos los teléfonos han sido corregidos');
        
        // Verificar el usuario admin específico
        const adminUser = await models.User.findById('68f3f9930ce104414ca4baa3');
        if (adminUser) {
            console.log(`👤 Usuario admin actualizado:`);
            console.log(`   Email: ${adminUser.email}`);
            console.log(`   Teléfono: ${adminUser.phone}`);
            console.log(`   Verificado: ${adminUser.isVerified}`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar solo si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    fixPhoneFormats();
}

export default fixPhoneFormats;
