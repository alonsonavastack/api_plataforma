// Script de prueba para verificar que Telegram funciona correctamente
import { sendOtpCode } from './api/helpers/telegram.js';

async function testTelegram() {
    console.log('🧪 PROBANDO ENVÍO DE TELEGRAM');
    console.log('============================');
    
    try {
        // Datos de prueba
        const testData = {
            code: '123456',
            phone: '527181043376', // Teléfono del admin sin el +
            userName: 'Admin Principal'
        };
        
        console.log('📤 Enviando código de prueba...');
        console.log('Datos:', testData);
        
        const result = await sendOtpCode(testData);
        
        if (result) {
            console.log('✅ ¡ÉXITO! El mensaje se envió correctamente a Telegram');
            console.log('📱 Revisa tu Telegram para ver el código de prueba');
        } else {
            console.log('❌ ERROR: No se pudo enviar el mensaje');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error);
        console.log('\n🔧 POSIBLES SOLUCIONES:');
        console.log('1. Verificar que TELEGRAM_TOKEN esté configurado correctamente');
        console.log('2. Verificar que TELEGRAM_CHAT_ID sea correcto');
        console.log('3. Verificar que el bot de Telegram esté activo');
        console.log('4. Verificar conexión a internet');
    }
}

// Ejecutar prueba
testTelegram();
