/**
 * 📱 SERVICIO DE NOTIFICACIONES DE TELEGRAM
 * 
 * Este servicio centraliza todas las notificaciones enviadas al bot de Telegram.
 * Incluye notificaciones para:
 * - Nuevas ventas/compras
 * - Creación de cursos
 * - Creación de proyectos
 */

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7958971419:AAFT29lhSOLzoZcWIMXHz8vha_5z95tX37Q';
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '5066230896'; // Renamed for clarity

if (!process.env.TELEGRAM_TOKEN) {
    console.warn('⚠️ TELEGRAM_TOKEN no está configurado en las variables de entorno; usando token por defecto incrustado en el código (no recomendado para producción).');
}

/**
 * Envía un mensaje a Telegram con formato Markdown
 * @param {string} text - Texto del mensaje (puede usar Markdown)
 * @param {string} [chatId] - ID del chat destino (opcional, por defecto al admin)
 * @returns {Promise<boolean>} - true si se envió exitosamente
 */
async function sendTelegramMessage(text, chatId = ADMIN_CHAT_ID) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(text)}&parse_mode=Markdown`;

        const response = await fetch(url);

        if (response.ok) {
            console.log(`✅ Notificación enviada a Telegram exitosamente (${chatId === ADMIN_CHAT_ID ? 'Admin' : 'Personalizado'})`);
            return true;
        } else {
            const errorData = await response.json();
            console.error('❌ Error al enviar notificación a Telegram:', errorData);
            return false;
        }
    } catch (error) {
        console.error('❌ Error al enviar mensaje a Telegram:', error.message);
        return false;
    }
}

/**
 * 📦 Notificación de nueva venta/compra
 * @param {Object} sale - Objeto de venta con detalles
 */
export async function notifyNewSale(sale) {
    try {
        // Formatear los productos comprados
        const productsText = sale.detail.map((item, index) =>
            `   ${index + 1}. ${item.title} - ${item.price_unit.toFixed(2)} ${sale.currency_total}`
        ).join('\n');

        // Determinar título según estado
        const isPending = sale.status === 'Pendiente';
        const title = isPending ? '⏳ *¡SOLICITUD DE COMPRA!*' : '📦 *¡NUEVA COMPRA REALIZADA!*';
        const statusEmoji = isPending ? '⏳' : '🟢';

        // Construir el mensaje
        const text = [
            title,
            '',
            `💳 *N° Transacción:* \`${sale.n_transaccion}\``,
            `👤 *Cliente:* ${sale.user.name} ${sale.user.surname}`,
            `✉️ *Correo:* ${sale.user.email}`,
            '',
            '🛍 *Productos:*',
            productsText,
            '',
            `💰 *Total:* ${sale.total.toFixed(2)} ${sale.currency_total}`,
            `💳 *Método:* ${sale.method_payment === 'transfer' ? 'Transferencia' : sale.method_payment}`,
            `${statusEmoji} *Estado:* ${sale.status}`,
            '',
            `📅 *Fecha:* ${new Date(sale.createdAt).toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                dateStyle: 'full',
                timeStyle: 'short'
            })}`,
            '',
            '👉 Revisa el dashboard para más detalles'
        ].join('\n');

        await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ Error al notificar nueva venta:', error.message);
    }
}

/**
 * 📄 Notificación de comprobante subido
 * @param {Object} sale - Objeto de venta
 */
export async function notifyVoucherUpload(sale) {
    try {
        const text = [
            '📄 *¡COMPROBANTE DE PAGO SUBIDO!*',
            '',
            `💳 *N° Transacción:* \`${sale.n_transaccion}\``,
            `👤 *Cliente:* ${sale.user.name} ${sale.user.surname}`,
            `✉️ *Correo:* ${sale.user.email}`,
            '',
            `💰 *Monto:* ${sale.total.toFixed(2)} ${sale.currency_total}`,
            '',
            '📎 *Comprobante:*',
            `[Ver Imagen](${process.env.URL_BACKEND || 'http://localhost:3000'}/api/sales/voucher-image/${sale.voucher_image})`,
            '',
            `📅 *Fecha:* ${new Date().toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                dateStyle: 'full',
                timeStyle: 'short'
            })}`,
            '',
            '👉 Ve a Ventas > Pendientes para aprobar'
        ].join('\n');

        await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ Error al notificar voucher:', error.message);
    }
}

/**
 * ✅ Notificación de pago aprobado
 * @param {Object} sale - Objeto de venta
 */
export async function notifyPaymentApproved(sale) {
    try {
        let userName = 'Cliente';
        let userChatId = null;

        // Importamos User de models de forma dinámica para evitar referencias circulares
        const { default: models } = await import('../models/index.js');
        let fullUser = null;

        if (sale.user) {
            // Verificar si sale.user ya trae campos como email o telegram_chat_id
            if (typeof sale.user === 'object' && sale.user.email) {
                fullUser = sale.user;
            } else {
                // Si solo viene el ID, lo buscamos en la base de datos
                fullUser = await models.User.findById(sale.user);
            }
        }

        if (fullUser) {
            userName = fullUser.name || 'Cliente';
            userChatId = fullUser.telegram_chat_id;
        }

        if (!userChatId) {
             console.log(`⚠️ El estudiante ${userName} no tiene Telegram vinculado. Se omite el envío de confirmación de compra a Telegram.`);
             return false;
        }

        const text = [
            '✅ *¡PAGO APROBADO!*',
            '',
            `Hola *${userName}*, tu compra ha sido verificada exitosamente.`,
            '',
            `💳 *N° Transacción:* \`${sale.n_transaccion}\``,
            `💰 *Monto:* ${sale.total.toFixed(2)} ${sale.currency_total || 'MXN'}`,
            '',
            '🚀 *¡Ya puedes acceder a tu contenido!*',
            'Ingresa a la plataforma para ver tus cursos o proyectos.',
            '',
            `📅 *Fecha:* ${new Date().toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                dateStyle: 'full',
                timeStyle: 'short'
            })}`
        ].join('\n');

        await sendTelegramMessage(text, userChatId);
    } catch (error) {
        console.error('❌ Error al notificar aprobación de pago:', error.message);
    }
}

/**
 * 📚 Notificación de nuevo curso creado
 * @param {Object} course - Objeto del curso
 * @param {Object} instructor - Objeto del instructor
 */
export async function notifyNewCourse(course, instructor) {
    try {
        // Determinar el estado del curso
        const estados = {
            1: '📝 Borrador',
            2: '✅ Público',
            3: '❌ Anulado'
        };
        const estadoTexto = estados[course.state] || 'Desconocido';

        // Formatear los precios (considerar si es gratuito)
        const priceUSD = course.isFree
            ? '🎁 *GRATUITO*'
            : course.price_usd
                ? `💵 ${course.price_usd.toFixed(2)} USD`
                : 'Sin precio definido';

        const text = [
            '📚 *¡NUEVO CURSO CREADO!*',
            '',
            `📖 *Título:* ${course.title}`,
            `📝 *Subtítulo:* ${course.subtitle || 'Sin subtítulo'}`,
            '',
            `👨‍🏫 *Instructor:* ${instructor.name} ${instructor.surname || ''}`,
            `✉️ *Correo instructor:* ${instructor.email}`,
            '',
            `📂 *Categoría:* ${course.categorie?.title || 'Sin categoría'}`,
            `📊 *Nivel:* ${course.level}`,
            `🌐 *Idioma:* ${course.idioma}`,
            '',
            `${course.isFree ? '🎁' : '💵'} *Precio:* ${priceUSD}`,
            '',
            `📌 *Estado:* ${estadoTexto}`,
            '',
            `📅 *Fecha de creación:* ${new Date(course.createdAt).toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                dateStyle: 'full',
                timeStyle: 'short'
            })}`,
            '',
            '👉 Revisa el dashboard para más detalles'
        ].join('\n');

        await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ Error al notificar nuevo curso:', error.message);
    }
}

/**
 * 🎨 Notificación de nuevo proyecto creado
 * @param {Object} project - Objeto del proyecto
 * @param {Object} instructor - Objeto del instructor
 */
export async function notifyNewProject(project, instructor) {
    try {
        // Formatear los precios (considerar si es gratuito)
        const priceUSD = project.isFree
            ? '🎁 *GRATUITO*'
            : project.price_usd
                ? `💵 ${project.price_usd.toFixed(2)} USD`
                : 'Sin precio definido';

        const text = [
            '🎨 *¡NUEVO PROYECTO CREADO!*',
            '',
            `📖 *Título:* ${project.title}`,
            `📝 *Subtítulo:* ${project.subtitle || 'Sin subtítulo'}`,
            '',
            `👨‍🏫 *Instructor:* ${instructor.name} ${instructor.surname || ''}`,
            `✉️ *Correo instructor:* ${instructor.email}`,
            '',
            `📂 *Categoría:* ${project.categorie?.title || 'Sin categoría'}`,
            `📊 *Nivel:* ${project.level}`,
            `🌐 *Idioma:* ${project.idioma}`,
            '',
            `${project.isFree ? '🎁' : '💵'} *Precio:* ${priceUSD}`,
            '',
            `📅 *Fecha de creación:* ${new Date(project.createdAt).toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                dateStyle: 'full',
                timeStyle: 'short'
            })}`,
            '',
            '👉 Revisa el dashboard para más detalles'
        ].join('\n');

        await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ Error al notificar nuevo proyecto:', error.message);
    }
}

/**
 * 🔄 Notificación de actualización importante
 * @param {string} type - Tipo de actualización ('course', 'project', 'sale')
 * @param {string} title - Título del elemento actualizado
 * @param {string} detail - Detalle de la actualización
 */
export async function notifyUpdate(type, title, detail) {
    try {
        const emojis = {
            course: '📚',
            project: '🎨',
            sale: '📦'
        };

        const text = [
            `${emojis[type] || '🔔'} *ACTUALIZACIÓN*`,
            '',
            `*Elemento:* ${title}`,
            `*Detalle:* ${detail}`,
            '',
            `📅 ${new Date().toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                dateStyle: 'short',
                timeStyle: 'short'
            })}`
        ].join('\n');

        await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ Error al notificar actualización:', error.message);
    }
}

/**
 * 💰 Notificación de pago procesado a instructor
 * @param {Object} payment - Objeto del pago
 * @param {Object} instructor - Objeto del instructor
 */
export async function notifyPaymentProcessed(payment, instructor) {
    try {
        const text = [
            '💰 *¡PAGO A INSTRUCTOR PROCESADO!*',
            '',
            `👨‍🏫 *Instructor:* ${instructor.name} ${instructor.surname || ''}`,
            `✉️ *Correo:* ${instructor.email}`,
            '',
            `💵 *Monto:* ${payment.final_amount.toFixed(2)} ${payment.currency}`,
            `💳 *Método:* ${payment.payment_method === 'paypal' ? 'PayPal' : 'Transferencia Bancaria'}`,
            '',
            `🆔 *ID Transacción:* \`${payment.payment_details?.paypal_transaction_id || payment.payment_details?.transfer_reference || 'N/A'}\``,
            '',
            `📅 *Fecha:* ${new Date().toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                dateStyle: 'full',
                timeStyle: 'short'
            })}`,
            '',
            '👉 Revisa el dashboard para más detalles'
        ].join('\n');

        await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ Error al notificar pago procesado:', error.message);
    }
}

/**
 * 🛠 Notificación de actualización de configuración de pago
 * @param {Object} instructor - Objeto del instructor
 * @param {string} method - Método actualizado (PayPal)
 * @param {string} detail - Detalle de la actualización (ej. email)
 */
export async function notifyInstructorPaymentUpdate(instructor, method, detail) {
    try {
        const text = [
            '🛠 *¡ACTUALIZACIÓN DE PAGO DE INSTRUCTOR!*',
            '',
            `👨‍🏫 *Instructor:* ${instructor.name} ${instructor.surname || ''}`,
            `✉️ *Correo:* ${instructor.email}`,
            '',
            `💳 *Método:* ${method}`,
            `📝 *Detalle:* \`${detail}\``,
            '',
            '⚠️ *Acción Requerida:* Verifica que esta cuenta sea válida para realizar pagos.',
            '',
            `📅 *Fecha:* ${new Date().toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                dateStyle: 'full',
                timeStyle: 'short'
            })}`
        ].join('\n');

        await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ Error al notificar actualización de pago:', error.message);
    }
}
/**
 * 🧾 Notificación de declaración fiscal emitida (CFDI)
 * @param {Object} instructor - Objeto del instructor (debe tener telegram_chat_id)
 * @param {Object} retention - Objeto de la retención
 * @param {string} monthName - Nombre del mes declarado
 */
export async function notifyDeclaration(instructor, retention, monthName) {
    try {
        if (!instructor.telegram_chat_id) {
            console.warn(`⚠️ Instructor ${instructor.name} no tiene telegram_chat_id. Omitiendo notificación.`);
            return false;
        }

        const text = [
            '🧾 *¡COMPROBANTE FISCAL EMITIDO!*',
            '',
            `Hola *${instructor.name}*, se ha generado tu constancia de retenciones.`,
            '',
            `📅 *Periodo:* ${monthName} / ${retention.year}`,
            `💰 *Ingresos:* ${retention.gross_earning.toFixed(2)} MXN`,
            `📉 *Retenciones:* ${retention.total_retention.toFixed(2)} MXN`,
            `💵 *Neto Pagado:* ${retention.net_pay.toFixed(2)} MXN`,
            '',
            '📂 *Comprobante (CFDI):*',
            'Puedes descargar tu XML y PDF desde el panel de instructor.',
            '',
            '⚠️ *Importante:* Recuerda realizar tu declaración anual ante el SAT.',
            '',
            `Emitido el: ${new Date().toLocaleDateString('es-MX')}`
        ].join('\n');

        return await sendTelegramMessage(text, instructor.telegram_chat_id);
    } catch (error) {
        console.error('❌ Error al notificar declaración:', error.message);
        return false;
    }
}

export default {
    notifyNewSale,
    notifyNewCourse,
    notifyNewProject,
    notifyUpdate,
    notifyPaymentProcessed,
    notifyPaymentApproved,
    notifyInstructorPaymentUpdate,
    notifyDeclaration
};
