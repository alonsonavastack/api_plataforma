/**
 * 📧 HELPER DE CORREOS — Dev Hub Sharks
 * Usa Resend (API HTTPS) — sin bloqueos de puerto SMTP en servidores cloud
 *
 * Variables requeridas en .env:
 *   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxx
 *   RESEND_FROM="Dev Hub Sharks <no-reply@devhubsharks.com>"
 *
 * Fallback a SMTP (nodemailer) si no hay RESEND_API_KEY (para desarrollo local)
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Envío con Resend ─────────────────────────────────────────────────────────
async function sendWithResend({ to, subject, html, text }) {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM || `Dev Hub Sharks <no-reply@devhubsharks.com>`;

    const { data, error } = await resend.emails.send({ from, to, subject, html, text });
    if (error) throw new Error(error.message);
    return data;
}

// ── Fallback SMTP con nodemailer (para local sin Resend) ─────────────────────
async function sendWithSMTP({ to, subject, html, text }) {
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        tls: { rejectUnauthorized: false },
    });
    const from = process.env.SMTP_FROM || `"Dev Hub Sharks" <${process.env.SMTP_USER}>`;
    const info = await transporter.sendMail({ from, to, subject, html, text });
    return info;
}

// ── Función base de envío ────────────────────────────────────────────────────
export async function sendEmail({ to, subject, html, text }) {
    try {
        if (process.env.RESEND_API_KEY) {
            const data = await sendWithResend({ to, subject, html, text });
            console.log(`✅ [email] Correo enviado (Resend) a ${to} | id: ${data?.id}`);
        } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            const info = await sendWithSMTP({ to, subject, html, text });
            console.log(`✅ [email] Correo enviado (SMTP) a ${to} | MessageId: ${info.messageId}`);
        } else {
            console.warn('⚠️ [email] Sin configuración de correo (RESEND_API_KEY o SMTP). Se omite.');
            return false;
        }
        return true;
    } catch (err) {
        console.error(`❌ [email] Error enviando correo a ${to}:`, err.message);
        return false;
    }
}

// ── Plantilla simple (fallback sin archivo HTML externo) ────────────────────
function buildPurchaseHtml({ userName, items, total, currency, transactionId, frontendUrl }) {
    const itemRows = items.map(i =>
        `<tr>
           <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px;color:#333;">${i.title}</td>
           <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px;color:#333;text-align:right;">
             ${i.price_unit.toFixed(2)} ${currency}
           </td>
         </tr>`
    ).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Confirmación de compra</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#84cc16,#22c55e);padding:36px 40px;text-align:center;">
            <h1 style="margin:0;color:#0f172a;font-size:28px;font-weight:900;letter-spacing:-0.5px;">
              🎉 ¡Compra exitosa!
            </h1>
            <p style="margin:8px 0 0;color:#1a2e05;font-size:15px;">
              Hola <strong>${userName}</strong>, tu pago fue procesado correctamente.
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">

            <!-- Transaction ID -->
            <p style="margin:0 0 24px;font-size:13px;color:#94a3b8;text-align:center;">
              N° Transacción: <span style="color:#a3e635;font-family:monospace;font-weight:700;">${transactionId}</span>
            </p>

            <!-- Products table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <th style="text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;border-bottom:2px solid #334155;">
                  Producto
                </th>
                <th style="text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;border-bottom:2px solid #334155;">
                  Precio
                </th>
              </tr>
              ${itemRows}
              <!-- Total row -->
              <tr>
                <td style="padding:14px 0 0;font-size:17px;font-weight:700;color:#f8fafc;">Total pagado</td>
                <td style="padding:14px 0 0;font-size:20px;font-weight:900;color:#a3e635;text-align:right;">
                  ${total.toFixed(2)} ${currency}
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 32px;">
                  <a href="${frontendUrl}/profile-student"
                     target="_blank"
                     style="display:inline-block;background:linear-gradient(135deg,#84cc16,#22c55e);color:#0f172a;font-weight:900;font-size:15px;text-decoration:none;padding:14px 36px;border-radius:50px;letter-spacing:0.3px;">
                    🚀 Ver mis compras
                  </a>
                </td>
              </tr>
            </table>

            <!-- Note -->
            <p style="margin:0;font-size:13px;color:#64748b;text-align:center;line-height:1.6;">
              Si tienes dudas, escríbenos a
              <a href="mailto:${process.env.SMTP_USER}" style="color:#a3e635;text-decoration:none;">${process.env.SMTP_USER}</a>.<br>
              ¡Gracias por confiar en <strong style="color:#f8fafc;">Dev Hub Sharks</strong>!
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#0f172a;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#475569;">
              © ${new Date().getFullYear()} Dev Hub Sharks · <a href="${frontendUrl}" style="color:#64748b;text-decoration:none;">devhubsharks.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Correo de confirmación de compra al USUARIO ──────────────────────────────
export async function sendPurchaseConfirmation({ user, sale }) {
    if (!user?.email) {
        console.warn('⚠️ [email] sendPurchaseConfirmation: usuario sin email, se omite.');
        return false;
    }

    const frontendUrl = process.env.URL_FRONTEND || 'https://devhubsharks.com';
    const currency = sale.currency_total || sale.currency_payment || 'MXN';

    const html = buildPurchaseHtml({
        userName:      `${user.name} ${user.surname || ''}`.trim(),
        items:         sale.detail || [],
        total:         sale.total || 0,
        currency,
        transactionId: sale.n_transaccion || sale._id,
        frontendUrl,
    });

    return sendEmail({
        to:      user.email,
        subject: `✅ Confirmación de compra — Dev Hub Sharks`,
        html,
        text: `Hola ${user.name}, tu compra fue procesada. N° ${sale.n_transaccion}. Total: ${(sale.total || 0).toFixed(2)} ${currency}.`,
    });
}

export default { sendEmail, sendPurchaseConfirmation };
