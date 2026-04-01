/**
 * 📱 SERVICIO DE NOTIFICACIONES DE TELEGRAM
 *
 * Centraliza todas las notificaciones al bot de Telegram:
 * - Nuevas ventas (admin)
 * - Pago aprobado (usuario)
 * - Nuevo usuario registrado (admin)
 * - Cursos/proyectos creados (admin)
 */

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_CHAT_ID  = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_TOKEN) {
    console.warn('⚠️ TELEGRAM_TOKEN no configurado en .env');
}

// ── Función base ─────────────────────────────────────────────────────────────
async function sendTelegramMessage(text, chatId = ADMIN_CHAT_ID) {
    try {
        if (!TELEGRAM_TOKEN || !chatId) {
            console.warn('⚠️ [Telegram] Sin token o chatId — mensaje omitido.');
            return false;
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
        });

        if (response.ok) {
            console.log(`✅ [Telegram] Mensaje enviado a ${chatId === ADMIN_CHAT_ID ? 'Admin' : chatId}`);
            return true;
        }

        const err = await response.json();
        console.error('❌ [Telegram] Error:', err);
        return false;
    } catch (error) {
        console.error('❌ [Telegram] Error de red:', error.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🛒 NUEVA VENTA — notificación al ADMIN
// Se llama justo después de que una compra queda en estado Pagado
// ─────────────────────────────────────────────────────────────────────────────
export async function notifyAdminNewSale(sale, user) {
    try {
        const currency    = sale.currency_total || sale.currency_payment || 'MXN';
        const metodoPago  = {
            stripe:       '💳 Stripe (tarjeta)',
            mixed_stripe: '💳 Stripe + Billetera',
            wallet:       '💰 Billetera',
            transfer:     '🏦 Transferencia',
        }[sale.method_payment] || sale.method_payment;

        const productsText = (sale.detail || []).map((item, i) =>
            `   ${i + 1}. *${item.title}* — ${(item.price_unit || 0).toFixed(2)} ${currency}`
        ).join('\n');

        const fecha = new Date().toLocaleString('es-MX', {
            timeZone:  'America/Mexico_City',
            dateStyle: 'full',
            timeStyle: 'short',
        });

        const text = [
            '🛒 *¡NUEVA COMPRA REALIZADA!*',
            '',
            `👤 *Cliente:* ${user.name} ${user.surname || ''}`,
            `✉️ *Email:* ${user.email}`,
            '',
            '🛍 *Productos:*',
            productsText,
            '',
            `💵 *Total:* ${(sale.total || 0).toFixed(2)} ${currency}`,
            `💳 *Método:* ${metodoPago}`,
            `🔖 *N° Transacción:* \`${sale.n_transaccion || sale._id}\``,
            '',
            `📅 *Fecha:* ${fecha}`,
            '',
            '👉 Revisa el panel de ventas para más detalles.',
        ].join('\n');

        return await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ [Telegram] notifyAdminNewSale:', error.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ PAGO APROBADO — notificación al USUARIO (si tiene Telegram vinculado)
// ─────────────────────────────────────────────────────────────────────────────
export async function notifyPaymentApproved(sale) {
    try {
        const { default: models } = await import('../models/index.js');
        let fullUser = null;

        if (sale.user) {
            if (typeof sale.user === 'object' && sale.user.email) {
                fullUser = sale.user;
            } else {
                fullUser = await models.User.findById(sale.user);
            }
        }

        if (!fullUser?.telegram_chat_id) {
            console.log(`⚠️ [Telegram] Usuario sin Telegram vinculado — confirmación omitida.`);
            return false;
        }

        const currency = sale.currency_total || sale.currency_payment || 'MXN';

        const text = [
            '✅ *¡PAGO APROBADO!*',
            '',
            `Hola *${fullUser.name}*, tu compra ha sido confirmada.`,
            '',
            `🔖 *N° Transacción:* \`${sale.n_transaccion || sale._id}\``,
            `💵 *Monto:* ${(sale.total || 0).toFixed(2)} ${currency}`,
            '',
            '🚀 *¡Ya puedes acceder a tu contenido!*',
            'Ingresa a la plataforma y ve a *Mi Perfil > Mis Compras*.',
            '',
            `📅 ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'full', timeStyle: 'short' })}`,
        ].join('\n');

        return await sendTelegramMessage(text, fullUser.telegram_chat_id);
    } catch (error) {
        console.error('❌ [Telegram] notifyPaymentApproved:', error.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 👤 NUEVO USUARIO (Telegram OTP o Google) — notificación al ADMIN
// ─────────────────────────────────────────────────────────────────────────────
export async function notifyAdminNewUser(user, via = 'registro') {
    try {
        const maskedPhone = user.phone
            ? user.phone.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1 $2 XXX $4')
            : 'No proporcionado';

        const origenEmoji = via === 'google' ? '🔵 Google' : '📱 Telegram';
        const estadoVerif  = user.isVerified ? '✅ Verificado' : '⏳ Pendiente de verificación';

        const fecha = new Date().toLocaleString('es-MX', {
            timeZone:  'America/Mexico_City',
            dateStyle: 'full',
            timeStyle: 'short',
        });

        const text = [
            `👤 *NUEVO USUARIO REGISTRADO* ${origenEmoji}`,
            '',
            `📝 *Nombre:* ${user.name} ${user.surname || ''}`,
            `✉️ *Email:* ${user.email}`,
            `📱 *Teléfono:* ${maskedPhone}`,
            `🎭 *Rol:* ${user.rol || 'cliente'}`,
            `🔐 *Estado:* ${estadoVerif}`,
            `🌐 *Registro vía:* ${origenEmoji}`,
            '',
            `📅 *Fecha:* ${fecha}`,
            '',
            '👉 Revisa el panel de administración para más detalles.',
        ].join('\n');

        return await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ [Telegram] notifyAdminNewUser:', error.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mantener compatibilidad con código existente
// ─────────────────────────────────────────────────────────────────────────────
export async function notifyNewSale(sale) {
    // Alias legacy — intenta obtener el usuario del objeto sale
    try {
        const { default: models } = await import('../models/index.js');
        let user = null;
        if (sale.user && typeof sale.user === 'object' && sale.user.email) {
            user = sale.user;
        } else if (sale.user) {
            user = await models.User.findById(sale.user);
        }
        if (user) return notifyAdminNewSale(sale, user);
    } catch (e) {
        console.error('❌ [Telegram] notifyNewSale (legacy):', e.message);
    }
    return false;
}

export async function notifyVoucherUpload(sale) {
    try {
        const text = [
            '📄 *¡COMPROBANTE DE PAGO SUBIDO!*',
            '',
            `🔖 *N° Transacción:* \`${sale.n_transaccion}\``,
            `👤 *Cliente:* ${sale.user?.name} ${sale.user?.surname || ''}`,
            `✉️ *Email:* ${sale.user?.email}`,
            `💵 *Monto:* ${(sale.total || 0).toFixed(2)} ${sale.currency_total || 'MXN'}`,
            '',
            '👉 Ve a Ventas > Pendientes para aprobar.',
        ].join('\n');

        return await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ [Telegram] notifyVoucherUpload:', error.message);
        return false;
    }
}

export async function notifyNewCourse(course, instructor) {
    try {
        const text = [
            '📚 *¡NUEVO CURSO CREADO!*',
            '',
            `📖 *Título:* ${course.title}`,
            `👨‍🏫 *Instructor:* ${instructor.name} ${instructor.surname || ''}`,
            `✉️ *Email:* ${instructor.email}`,
            `📊 *Nivel:* ${course.level}`,
            `💵 *Precio:* ${course.isFree ? '🎁 Gratuito' : `${course.price_usd?.toFixed(2)} USD`}`,
            `📌 *Estado:* ${course.state === 2 ? '✅ Público' : '📝 Borrador'}`,
            '',
            '👉 Revisa el dashboard para aprobar o revisar.',
        ].join('\n');

        return await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ [Telegram] notifyNewCourse:', error.message);
        return false;
    }
}

export async function notifyNewProject(project, instructor) {
    try {
        const text = [
            '🎨 *¡NUEVO PROYECTO CREADO!*',
            '',
            `📖 *Título:* ${project.title}`,
            `👨‍🏫 *Instructor:* ${instructor.name} ${instructor.surname || ''}`,
            `✉️ *Email:* ${instructor.email}`,
            `💵 *Precio:* ${project.isFree ? '🎁 Gratuito' : `${project.price_usd?.toFixed(2)} USD`}`,
            '',
            '👉 Revisa el dashboard para aprobar o revisar.',
        ].join('\n');

        return await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ [Telegram] notifyNewProject:', error.message);
        return false;
    }
}

export async function notifyUpdate(type, title, detail) {
    try {
        const emojis = { course: '📚', project: '🎨', sale: '📦' };
        const text = [
            `${emojis[type] || '🔔'} *ACTUALIZACIÓN*`,
            `*Elemento:* ${title}`,
            `*Detalle:* ${detail}`,
        ].join('\n');
        return await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ [Telegram] notifyUpdate:', error.message);
        return false;
    }
}

export async function notifyPaymentProcessed(payment, instructor) {
    try {
        const text = [
            '💰 *¡PAGO A INSTRUCTOR PROCESADO!*',
            '',
            `👨‍🏫 *Instructor:* ${instructor.name} ${instructor.surname || ''}`,
            `✉️ *Email:* ${instructor.email}`,
            `💵 *Monto:* ${payment.final_amount?.toFixed(2)} ${payment.currency}`,
            `💳 *Método:* ${payment.payment_method}`,
        ].join('\n');
        return await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ [Telegram] notifyPaymentProcessed:', error.message);
        return false;
    }
}

export async function notifyInstructorPaymentUpdate(instructor, method, detail) {
    try {
        const text = [
            '🛠 *¡ACTUALIZACIÓN DE PAGO DE INSTRUCTOR!*',
            `👨‍🏫 *Instructor:* ${instructor.name} ${instructor.surname || ''}`,
            `💳 *Método:* ${method}`,
            `📝 *Detalle:* \`${detail}\``,
        ].join('\n');
        return await sendTelegramMessage(text);
    } catch (error) {
        console.error('❌ [Telegram] notifyInstructorPaymentUpdate:', error.message);
        return false;
    }
}

export async function notifyDeclaration(instructor, retention, monthName) {
    try {
        if (!instructor.telegram_chat_id) return false;
        const text = [
            '🧾 *¡COMPROBANTE FISCAL EMITIDO!*',
            '',
            `Hola *${instructor.name}*, tu constancia de retenciones fue generada.`,
            `📅 *Periodo:* ${monthName} / ${retention.year}`,
            `💰 *Ingresos:* ${retention.gross_earning?.toFixed(2)} MXN`,
            `📉 *Retenciones:* ${retention.total_retention?.toFixed(2)} MXN`,
            `💵 *Neto:* ${retention.net_pay?.toFixed(2)} MXN`,
        ].join('\n');
        return await sendTelegramMessage(text, instructor.telegram_chat_id);
    } catch (error) {
        console.error('❌ [Telegram] notifyDeclaration:', error.message);
        return false;
    }
}

export default {
    notifyAdminNewSale,
    notifyAdminNewUser,
    notifyNewSale,
    notifyNewCourse,
    notifyNewProject,
    notifyUpdate,
    notifyPaymentProcessed,
    notifyPaymentApproved,
    notifyInstructorPaymentUpdate,
    notifyDeclaration,
    notifyVoucherUpload,
};
