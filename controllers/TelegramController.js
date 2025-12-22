import models from '../models/index.js';
import { sendTelegramMessage } from '../helpers/telegram.js';

export default {
    /**
     * Webhook de Telegram (POST). Espera recibir los updates del bot.
     * Para vincular cuenta: enviar `/start <email|userId>` desde el chat con el bot.
     */
    webhook: async (req, res) => {
        try {
            const update = req.body;

            if (!update) return res.status(200).send('no update');

            const message = update.message || update.edited_message;
            if (!message) return res.status(200).send('no message');

            const chatId = message.chat && message.chat.id ? String(message.chat.id) : null;
            const text = message.text ? message.text.trim() : '';

            if (!text || !chatId) {
                return res.status(200).send('ok');
            }

            // Procesar comando /start
            if (text.startsWith('/start')) {
                const parts = text.split(' ').filter(Boolean);
                const token = parts[1]; // puede ser email o userId

                if (!token) {
                    await sendTelegramMessage('Para vincular tu cuenta, usa: /start tu-email@ejemplo.com', chatId);
                    return res.status(200).send('no token');
                }

                // Intentar resolver por userId (ObjectId) o por email
                let user = null;
                try {
                    if (/^[0-9a-fA-F]{24}$/.test(token)) {
                        user = await models.User.findById(token);
                    }
                } catch (err) {
                    // ignore
                }

                if (!user) {
                    user = await models.User.findOne({ email: token });
                }

                if (!user) {
                    await sendTelegramMessage('No encontramos una cuenta con ese identificador. Envía /start tu-email@ejemplo.com o contacta soporte.', chatId);
                    return res.status(200).send('user not found');
                }

                // Guardar chat id
                user.telegram_chat_id = chatId;
                await user.save();

                await sendTelegramMessage(`✅ ¡Listo ${user.name}! Tu cuenta ha sido vinculada a Telegram correctamente.`, chatId);
                console.log(`🔗 Usuario ${user.email} vinculado a Telegram (${chatId})`);
                return res.status(200).send('linked');
            }

            // Mensaje no manejado
            return res.status(200).send('ok');
        } catch (error) {
            console.error('❌ Error en Telegram webhook:', error);
            return res.status(500).send('error');
        }
    }
};
