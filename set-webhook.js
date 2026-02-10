import dotenv from 'dotenv';


dotenv.config();

const token = process.env.TELEGRAM_TOKEN;
const args = process.argv.slice(2);
const publicUrl = args[0];

if (!token) {
    console.error('❌ Error: TELEGRAM_TOKEN no está definido en .env');
    process.exit(1);
}

if (!publicUrl) {
    console.error('❌ Error: Debes proporcionar la URL pública (HTTPS) como argumento.');
    console.error('Uso: node set-webhook.js https://tu-dominio.ngrok-free.app');
    process.exit(1);
}

const webhookUrl = `${publicUrl}/api/telegram/webhook`;

console.log(`🔌 Configurando Webhook en: ${webhookUrl}`);

async function setWebhook() {
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`);
        const data = await response.json();

        if (data.ok) {
            console.log('✅ Webhook configurado exitosamente!');
            console.log(data);
        } else {
            console.error('❌ Error al configurar webhook:', data);
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error.message);
    }
}

setWebhook();
