import crypto from 'crypto';

console.log('🔍 Verificando configuración de encriptación...\n');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ENCRYPTION_IV = process.env.ENCRYPTION_IV;

console.log('📋 Variables de entorno:');
console.log(`ENCRYPTION_KEY: ${ENCRYPTION_KEY ? '✅ Definida' : '❌ No definida'}`);
console.log(`ENCRYPTION_IV: ${ENCRYPTION_IV ? '✅ Definida' : '❌ No definida'}\n`);

if (ENCRYPTION_KEY) {
    console.log(`Longitud ENCRYPTION_KEY: ${ENCRYPTION_KEY.length} caracteres ${ENCRYPTION_KEY.length === 32 ? '✅' : '❌ (debe ser 32)'}`);
}

if (ENCRYPTION_IV) {
    console.log(`Longitud ENCRYPTION_IV: ${ENCRYPTION_IV.length} caracteres ${ENCRYPTION_IV.length === 16 ? '✅' : '❌ (debe ser 16)'}`);
}

console.log('\n🧪 Probando encriptación...\n');

if (ENCRYPTION_KEY?.length === 32 && ENCRYPTION_IV?.length === 16) {
    try {
        const testText = '1234567890';
        const cipher = crypto.createCipheriv(
            'aes-256-cbc',
            Buffer.from(ENCRYPTION_KEY),
            Buffer.from(ENCRYPTION_IV)
        );
        
        let encrypted = cipher.update(testText, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        console.log('✅ Encriptación exitosa');
        console.log(`Texto original: ${testText}`);
        console.log(`Texto encriptado: ${encrypted}\n`);
        
        // Probar desencriptación
        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            Buffer.from(ENCRYPTION_KEY),
            Buffer.from(ENCRYPTION_IV)
        );
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        console.log('✅ Desencriptación exitosa');
        console.log(`Texto desencriptado: ${decrypted}\n`);
        
        if (testText === decrypted) {
            console.log('🎉 ¡Todo funciona correctamente!');
        } else {
            console.log('❌ Error: El texto desencriptado no coincide');
        }
        
    } catch (error) {
        console.error('❌ Error al encriptar/desencriptar:', error.message);
    }
} else {
    console.log('❌ No se puede probar: las variables no tienen la longitud correcta');
    console.log('\n💡 Solución:');
    console.log('Agrega estas líneas a tu archivo .env:');
    console.log('ENCRYPTION_KEY=c536e53f3956a4828e6aaf0839d70bbf');
    console.log('ENCRYPTION_IV=1234567890abcdef');
}
