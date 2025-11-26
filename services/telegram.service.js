/**
 * 📱 SERVICIO DE NOTIFICACIONES DE TELEGRAM
 * 
 * Este servicio centraliza todas las notificaciones enviadas al bot de Telegram.
 * Incluye notificaciones para:
 * - Nuevas ventas/compras
 * - Creación de cursos
 * - Creación de proyectos
 */

const TELEGRAM_TOKEN = '7958971419:AAFT29lhSOLzoZcWIMXHz8vha_5z95tX37Q';
const CHAT_ID = '5066230896';

/**
 * Envía un mensaje a Telegram con formato Markdown
 * @param {string} text - Texto del mensaje (puede usar Markdown)
 * @returns {Promise<boolean>} - true si se envió exitosamente
 */
async function sendTelegramMessage(text) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(text)}&parse_mode=Markdown`;

        const response = await fetch(url);

        if (response.ok) {
            console.log('✅ Notificación enviada a Telegram exitosamente');
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
        const text = [
            '✅ *¡PAGO APROBADO!*',
            '',
            `Hola *${sale.user.name}*, tu compra ha sido verificada exitosamente.`,
            '',
            `💳 *N° Transacción:* \`${sale.n_transaccion}\``,
            `💰 *Monto:* ${sale.total.toFixed(2)} ${sale.currency_total}`,
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

        await sendTelegramMessage(text);
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

export default {
    notifyNewSale,
    notifyNewCourse,
    notifyNewProject,
    notifyUpdate,
    notifyUpdate,
    notifyPaymentProcessed,
    notifyPaymentApproved
};
