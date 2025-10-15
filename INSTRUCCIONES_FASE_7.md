# INSTRUCCIONES - FASE 7: EMAILS

## 📧 Configuración de Email

Para que el sistema de emails funcione correctamente, agrega estas variables a tu archivo `.env`:

```env
# Configuración de Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu_email@gmail.com
EMAIL_PASS=tu_contraseña_de_aplicacion
EMAIL_FROM=tu_email@gmail.com
EMAIL_FROM_NAME=Plataforma de Cursos

# URL del Frontend (para links en emails)
FRONTEND_URL=http://localhost:4200

# Claves de encriptación (para datos bancarios)
ENCRYPTION_KEY=tu_clave_secreta_de_32_caracteres_exactos
ENCRYPTION_IV=tu_vector_inicial_de_16_caracteres
```

## 🔐 Contraseña de Aplicación de Gmail

Si usas Gmail, necesitas generar una "Contraseña de aplicación":

1. Ve a tu cuenta de Google: https://myaccount.google.com/
2. Seguridad > Verificación en dos pasos (activar si no está)
3. Busca "Contraseñas de aplicaciones"
4. Genera una nueva contraseña para "Correo"
5. Usa esa contraseña en `EMAIL_PASS`

## ✅ Verificar Configuración

Puedes verificar que la configuración esté correcta usando:

```javascript
import { verifyEmailConfig, sendTestEmail } from './utils/emailService.js';

// Verificar configuración
await verifyEmailConfig();

// Enviar email de prueba
await sendTestEmail('destinatario@email.com');
```

## 📨 Templates de Email Creados

1. **payment_processed.html** - Se envía cuando el admin procesa un pago
2. **new_earning.html** - Se envía cuando se registra una nueva venta/ganancia

## 🔄 Integración Automática

Los emails se enviarán automáticamente en:

- ✅ **Nueva venta**: Cuando `Sale.status` cambia a "Pagado" (hook en Sale.js)
- ✅ **Pago procesado**: Cuando el admin completa un pago a instructor

## 🧪 Testing

Para probar los emails sin esperar ventas reales:

```javascript
import { sendNewEarningEmail, sendPaymentProcessedEmail } from './utils/emailService.js';
import User from './models/User.js';
import InstructorEarnings from './models/InstructorEarnings.js';

// Test: Email de nueva ganancia
const instructor = await User.findOne({ rol: 'instructor' });
const earning = await InstructorEarnings.findOne().populate('course');
await sendNewEarningEmail(instructor, earning);

// Test: Email de pago procesado
const payment = await InstructorPayment.findOne().populate('instructor');
await sendPaymentProcessedEmail(payment.instructor, payment);
```

## ⚠️ Importante

- Los emails son **opcionales**. El sistema funciona sin ellos.
- Si la configuración de email falla, se loguea el error pero no detiene la operación.
- Los templates usan **Handlebars** para variables dinámicas.

## 🎨 Personalizar Templates

Los templates HTML están en `/api/mails/`. Puedes editarlos para personalizar:
- Colores y estilos
- Textos e imágenes
- Estructura del contenido

Variables disponibles en cada template están comentadas en `emailService.js`.
