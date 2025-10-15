import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handlebars from 'handlebars';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SERVICIO DE EMAILS
 * Gestiona el envío de correos electrónicos usando nodemailer y templates HTML
 */

/**
 * Configurar el transporter de nodemailer
 * Asegúrate de tener estas variables en tu .env:
 * - EMAIL_HOST
 * - EMAIL_PORT
 * - EMAIL_USER
 * - EMAIL_PASS
 * - EMAIL_FROM
 */
function createTransporter() {
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false, // true para 465, false para otros puertos
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
}

/**
 * Leer y compilar un template HTML con Handlebars
 * @param {string} templateName - Nombre del archivo del template (sin .html)
 * @param {object} data - Datos para reemplazar en el template
 * @returns {string} HTML compilado
 */
function compileTemplate(templateName, data) {
    try {
        const templatePath = path.join(__dirname, '..', 'mails', `${templateName}.html`);
        const templateSource = fs.readFileSync(templatePath, 'utf8');
        const template = handlebars.compile(templateSource);
        return template(data);
    } catch (error) {
        console.error(`Error al compilar template ${templateName}:`, error);
        throw new Error(`No se pudo compilar el template: ${templateName}`);
    }
}

/**
 * Registrar helpers de Handlebars para los templates
 */
handlebars.registerHelper('if', function(conditional, options) {
    if (conditional) {
        return options.fn(this);
    } else {
        return options.inverse(this);
    }
});

handlebars.registerHelper('eq', function(a, b) {
    return a === b;
});

/**
 * Enviar email de pago procesado al instructor
 * @param {object} instructor - Objeto instructor con name, email, etc.
 * @param {object} payment - Objeto payment con detalles del pago
 */
export async function sendPaymentProcessedEmail(instructor, payment) {
    try {
        console.log(`📧 Enviando email de pago procesado a: ${instructor.email}`);

        const transporter = createTransporter();

        // Preparar datos para el template
        const templateData = {
            instructorName: instructor.name || 'Instructor',
            paymentId: payment._id.toString(),
            paymentMethod: payment.payment_method === 'paypal' ? 'PayPal' : 'Transferencia Bancaria',
            totalEarnings: payment.total_earnings.toFixed(2),
            deductions: payment.platform_deductions > 0 ? payment.platform_deductions.toFixed(2) : null,
            finalAmount: payment.final_amount.toFixed(2),
            currency: payment.currency || 'USD',
            processedDate: new Date(payment.processed_at || payment.created_by_admin_at).toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            transactionId: payment.payment_details?.paypal_transaction_id || 
                          payment.payment_details?.transfer_reference || 
                          null,
            earningsCount: payment.earnings_included?.length || 0,
            adminNotes: payment.admin_notes || null,
            dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/instructor/payment-history`
        };

        // Compilar template
        const htmlContent = compileTemplate('payment_processed', templateData);

        // Configurar email
        const mailOptions = {
            from: `"${process.env.EMAIL_FROM_NAME || 'Plataforma de Cursos'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to: instructor.email,
            subject: `💰 Pago Procesado - ${payment.currency} $${payment.final_amount.toFixed(2)}`,
            html: htmlContent
        };

        // Enviar email
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email enviado exitosamente a ${instructor.email}. ID: ${info.messageId}`);
        
        return {
            success: true,
            messageId: info.messageId
        };
    } catch (error) {
        console.error('❌ Error al enviar email de pago procesado:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Enviar email de nueva ganancia al instructor
 * @param {object} instructor - Objeto instructor con name, email, etc.
 * @param {object} earning - Objeto earning con detalles de la ganancia
 */
export async function sendNewEarningEmail(instructor, earning) {
    try {
        console.log(`📧 Enviando email de nueva ganancia a: ${instructor.email}`);

        const transporter = createTransporter();

        // Calcular días hasta disponible
        const now = new Date();
        const availableDate = new Date(earning.available_at);
        const daysUntilAvailable = Math.ceil((availableDate - now) / (1000 * 60 * 60 * 24));

        // Determinar status
        const isPending = earning.status === 'pending';
        const statusText = isPending ? 'Pendiente' : 'Disponible';
        const statusClass = isPending ? 'status-pending' : 'status-available';

        // Preparar datos para el template
        const templateData = {
            instructorName: instructor.name || 'Instructor',
            courseTitle: earning.course?.title || 'Curso',
            salePrice: earning.sale_price.toFixed(2),
            commissionRate: earning.platform_commission_rate,
            platformCommission: earning.platform_commission_amount.toFixed(2),
            instructorEarning: earning.instructor_earning.toFixed(2),
            currency: earning.currency || 'USD',
            saleDate: new Date(earning.earned_at).toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            availableDate: availableDate.toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            daysUntilAvailable: Math.max(0, daysUntilAvailable),
            isPending,
            statusText,
            statusClass,
            totalEarnings: `$${earning.instructor_earning.toFixed(2)}`, // Placeholder, se puede calcular
            totalSales: '1', // Placeholder, se puede calcular
            earningsUrl: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/instructor/earnings`
        };

        // Compilar template
        const htmlContent = compileTemplate('new_earning', templateData);

        // Configurar email
        const mailOptions = {
            from: `"${process.env.EMAIL_FROM_NAME || 'Plataforma de Cursos'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to: instructor.email,
            subject: `🎉 Nueva Venta - ${earning.currency} $${earning.instructor_earning.toFixed(2)} | ${earning.course?.title || 'Curso'}`,
            html: htmlContent
        };

        // Enviar email
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email enviado exitosamente a ${instructor.email}. ID: ${info.messageId}`);
        
        return {
            success: true,
            messageId: info.messageId
        };
    } catch (error) {
        console.error('❌ Error al enviar email de nueva ganancia:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Enviar email genérico (útil para testing)
 * @param {string} to - Email destino
 * @param {string} subject - Asunto del email
 * @param {string} html - Contenido HTML
 */
export async function sendGenericEmail(to, subject, html) {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: `"${process.env.EMAIL_FROM_NAME || 'Plataforma de Cursos'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email genérico enviado a ${to}. ID: ${info.messageId}`);
        
        return {
            success: true,
            messageId: info.messageId
        };
    } catch (error) {
        console.error('❌ Error al enviar email genérico:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Verificar configuración de email
 * Útil para testing
 */
export async function verifyEmailConfig() {
    try {
        const transporter = createTransporter();
        await transporter.verify();
        console.log('✅ Configuración de email verificada correctamente');
        return { success: true };
    } catch (error) {
        console.error('❌ Error en la configuración de email:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Enviar email de test
 * @param {string} to - Email destino
 */
export async function sendTestEmail(to) {
    try {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 30px; border-radius: 10px; }
                    h1 { color: #333; }
                    p { color: #666; line-height: 1.6; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✅ Email de Prueba</h1>
                    <p>Si estás viendo este mensaje, significa que la configuración de email está funcionando correctamente.</p>
                    <p>Fecha de envío: ${new Date().toLocaleString('es-MX')}</p>
                    <hr>
                    <p style="font-size: 12px; color: #999;">
                        Este es un correo de prueba del sistema de pagos a instructores.
                    </p>
                </div>
            </body>
            </html>
        `;

        return await sendGenericEmail(to, '✅ Test Email - Configuración Correcta', html);
    } catch (error) {
        console.error('❌ Error al enviar email de test:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

export default {
    sendPaymentProcessedEmail,
    sendNewEarningEmail,
    sendGenericEmail,
    verifyEmailConfig,
    sendTestEmail
};
