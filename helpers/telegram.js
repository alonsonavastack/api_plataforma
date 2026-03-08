// helpers/telegram.js
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Envía un mensaje a Telegram con formato Markdown
 * @param {string} text - Texto del mensaje (puede usar Markdown)
 * @param {string} chatId - ID del chat (opcional, usa el por defecto si no se especifica)
 * @returns {Promise<boolean>} - true si se envió exitosamente
 */
async function sendTelegramMessage(text, chatId = TELEGRAM_CHAT_ID) {
    try {
        if (!TELEGRAM_TOKEN) {
            console.error('❌ Error: TELEGRAM_TOKEN no está configurado en las variables de entorno');
            return false;
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

        const payload = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log('✅ Mensaje enviado a Telegram exitosamente');
            return true;
        } else {
            const errorData = await response.json();
            console.error('❌ Error al enviar mensaje a Telegram:', errorData);
            return false;
        }
    } catch (error) {
        console.error('❌ Error al enviar mensaje a Telegram:', error.message);
        return false;
    }
}

/**
 * Envía código OTP de verificación de registro a Telegram
 * @param {string} code - Código OTP de 6 dígitos
 * @param {string} phone - Número de teléfono del usuario (enmascarado)
 * @param {string} userName - Nombre del usuario
 * @param {string} chatId - ID del chat de Telegram (opcional)
 * @returns {Promise<boolean>} - true si se envió exitosamente
 */
export async function sendOtpCode({ code, phone, userName, chatId }) {
    console.log('🚀 sendOtpCode (Telegram) llamado con:', { code, phone, userName, chatId });
    console.log('🔑 Configuración Telegram:', {
        tokenExists: !!TELEGRAM_TOKEN,
        tokenLength: TELEGRAM_TOKEN?.length,
        tokenStart: TELEGRAM_TOKEN ? TELEGRAM_TOKEN.substring(0, 5) + '...' : 'N/A',
        defaultChatId: TELEGRAM_CHAT_ID,
        targetChatId: chatId || TELEGRAM_CHAT_ID
    });

    try {
        // Enmascarar el teléfono para privacidad
        const maskedPhone = phone ? phone.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1 $2 XXX $4') : 'N/A';

        const text = [
            '🔐 *CÓDIGO DE VERIFICACIÓN*',
            '',
            `👤 *Usuario:* ${userName}`,
            `📱 *Teléfono:* ${maskedPhone}`,
            '',
            `🔢 *Tu código de verificación es:*`,
            `\`${code}\``,
            '',
            '⏰ *Este código expira en 10 minutos*',
            '',
            '⚠️ *Importante:*',
            '• No compartas este código con nadie',
            '• Si no solicitaste este código, ignora este mensaje',
            '• El código es válido por una sola vez',
            '',
            '✅ Ingresa este código en la plataforma para completar tu registro'
        ].join('\n');

        console.log('📤 Enviando mensaje a Telegram:', {
            chatId: chatId || TELEGRAM_CHAT_ID,
            textLength: text.length,
            code: code
        });

        const result = await sendTelegramMessage(text, chatId);
        console.log('✅ Telegram OTP Response:', result);
        return result;
    } catch (error) {
        console.error('❌ Error en sendOtpCode (Telegram):', error);
        throw error;
    }
}

/**
 * Envía código OTP de recuperación de contraseña a Telegram
 * @param {string} code - Código OTP de 6 dígitos
 * @param {string} phone - Número de teléfono del usuario (enmascarado)
 * @param {string} userName - Nombre del usuario
 * @param {string} chatId - ID del chat de Telegram (opcional)
 * @returns {Promise<boolean>} - true si se envió exitosamente
 */
export async function sendRecoveryOtp({ code, phone, userName, chatId }) {
    console.log('🚀 sendRecoveryOtp (Telegram) llamado con:', { code, phone, userName, chatId });
    console.log('🔑 Configuración Telegram:', {
        tokenExists: !!TELEGRAM_TOKEN,
        tokenLength: TELEGRAM_TOKEN?.length,
        tokenStart: TELEGRAM_TOKEN ? TELEGRAM_TOKEN.substring(0, 5) + '...' : 'N/A',
        defaultChatId: TELEGRAM_CHAT_ID,
        targetChatId: chatId || TELEGRAM_CHAT_ID
    });

    try {
        // Enmascarar el teléfono para privacidad
        const maskedPhone = phone ? phone.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1 $2 XXX $4') : 'N/A';

        const text = [
            '🔑 *RECUPERACIÓN DE CONTRASEÑA*',
            '',
            `👤 *Usuario:* ${userName}`,
            `📱 *Teléfono:* ${maskedPhone}`,
            '',
            `🔢 *Tu código de recuperación es:*`,
            `\`${code}\``,
            '',
            '⏰ *Este código expira en 10 minutos*',
            '',
            '⚠️ *Importante:*',
            '• No compartas este código con nadie',
            '• Si no solicitaste recuperar tu contraseña, ignora este mensaje',
            '• El código es válido por una sola vez',
            '',
            '✅ Ingresa este código en la plataforma para restablecer tu contraseña'
        ].join('\n');

        const result = await sendTelegramMessage(text, chatId);
        console.log('✅ Telegram Recovery OTP Response:', result);
        return result;
    } catch (error) {
        console.error('❌ Error en sendRecoveryOtp (Telegram):', error);
        throw error;
    }
}

/**
 * Envía notificación de nuevo registro a Telegram (para administradores)
 * @param {Object} user - Objeto del usuario registrado
 * @param {string} otpCode - Código OTP generado (opcional)
 * @returns {Promise<boolean>} - true si se envió exitosamente
 */
export async function notifyNewRegistration(user, otpCode = null) {
    try {
        const maskedPhone = user.phone ? user.phone.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1 $2 XXX $4') : 'No proporcionado';

        const text = [
            '👤 *NUEVO REGISTRO DE USUARIO*',
            '',
            `📝 *Nombre:* ${user.name} ${user.surname || ''}`,
            `✉️ *Email:* ${user.email}`,
            `📱 *Teléfono:* ${maskedPhone}`,
            `🎭 *Rol:* ${user.rol}`,
            '',
            `📅 *Fecha de registro:* ${new Date(user.createdAt).toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                dateStyle: 'full',
                timeStyle: 'short'
            })}`,
            '',
            '🔐 *Estado:* Pendiente de verificación OTP',
            ...(otpCode ? [
                '',
                `🔑 *CÓDIGO OTP:* \`${otpCode}\``,
                '_Puedes compartirle este código al usuario si tiene problemas para recibirlo._'
            ] : []),
            '',
            '👉 Revisa el dashboard para más detalles'
        ].join('\n');

        return await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ Error al notificar nuevo registro:', error.message);
        return false;
    }
}

/**
 * Envía notificación de verificación exitosa a Telegram (para administradores)
 * @param {Object} user - Objeto del usuario verificado
 * @returns {Promise<boolean>} - true si se envió exitosamente
 */
export async function notifySuccessfulVerification(user) {
    try {
        const maskedPhone = user.phone ? user.phone.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1 $2 XXX $4') : 'No proporcionado';

        const text = [
            '✅ *USUARIO VERIFICADO EXITOSAMENTE*',
            '',
            `📝 *Nombre:* ${user.name} ${user.surname || ''}`,
            `✉️ *Email:* ${user.email}`,
            `📱 *Teléfono:* ${maskedPhone}`,
            `🎭 *Rol:* ${user.rol}`,
            '',
            `📅 *Fecha de verificación:* ${new Date().toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                dateStyle: 'full',
                timeStyle: 'short'
            })}`,
            '',
            '🎉 *Estado:* Cuenta activa y verificada',
            '',
            '👉 El usuario ya puede acceder a la plataforma'
        ].join('\n');

        return await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ Error al notificar verificación exitosa:', error.message);
        return false;
    }
}

export default {
    sendOtpCode,
    sendRecoveryOtp,
    notifyNewRegistration,
    notifySuccessfulVerification
};

// Exponer sendTelegramMessage para uso en otros controladores (ej. webhook del bot)
export { sendTelegramMessage };
