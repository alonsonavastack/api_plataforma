import TelegramController from '../controllers/TelegramController.js';

let isPolling = false;
let lastUpdateId = 0;

/**
 * Inicia el Polling de Telegram (Solo para desarrollo)
 * Simula el comportamiento del Webhook consultando activamente la API
 */
export const startTelegramPolling = async () => {
    if (process.env.NODE_ENV === 'production') {
        console.log('🚫 Telegram Polling omitido en producción (se usa Webhook).');
        return;
    }

    if (isPolling) return;
    isPolling = true;

    const token = process.env.TELEGRAM_TOKEN;
    if (!token) {
        console.error('❌ No se puede iniciar Telegram Polling: TELEGRAM_TOKEN faltante.');
        return;
    }

    // 1. Limpiar Webhook existente para permitir Polling
    try {
        await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
        console.log('🧹 Webhook eliminado para permitir Polling local.');
    } catch (e) {
        console.error('⚠️ Error al limpiar webhook:', e.message);
    }

    console.log('🤖 Iniciando Telegram Polling (Modo Desarrollo)...');

    const poll = async () => {
        try {
            const offset = lastUpdateId ? lastUpdateId + 1 : 0;
            const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=10`);
            const data = await response.json();

            if (data.ok && data.result.length > 0) {
                for (const update of data.result) {
                    lastUpdateId = update.update_id;

                    // Simular Request/Response de Express
                    const req = { body: update };
                    const res = {
                        status: () => ({ send: () => { } }),
                        send: () => { }
                    };

                    console.log(`📩 [Polling] Nuevo mensaje recibido: ${update.message?.text}`);

                    // Llamar al controlador existente
                    await TelegramController.webhook(req, res);
                }
            }
        } catch (error) {
            console.error('⚠️ Error en Polling:', error.message);
        }

        // Continuar polling si no se ha detenido
        if (isPolling) {
            setTimeout(poll, 2000); // Esperar 2s entre consultas
        }
    };

    poll();
};
