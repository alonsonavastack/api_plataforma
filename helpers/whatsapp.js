// helpers/whatsapp.js
const WA_BASE = (phoneId) => `https://graph.facebook.com/v20.0/${phoneId}/messages`;

/**
 * Enviar PLANTILLA (template)
 * - template: nombre exacto (ej. 'otp_code_1')
 * - lang: código de idioma (Spanish All = 'es', Spanish MEX = 'es_MX')
 * - bodyParams: variables del BODY [{ type:'text', text:'123456' }]
 * - urlButtons: variables para botones URL [{ index:0, text:'valor-para-{{1}}' }]
 */
export async function sendWhatsTemplate({
  to,
  template,
  lang = 'es',
  bodyParams = [],
  urlButtons = [],
}) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  
  console.log('🔑 Credenciales WhatsApp:', {
    tokenExists: !!token,
    tokenLength: token?.length,
    tokenStart: token?.substring(0, 20) + '...',
    phoneId: phoneId
  });
  
  if (!token || !phoneId) throw new Error('Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_ID');

  const components = [];
  if (bodyParams.length) {
    components.push({ type: 'body', parameters: bodyParams });
  }
  // Botones URL con variable en el template (index 0..n)
  for (const btn of urlButtons) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(btn.index ?? 0),
      parameters: [{ type: 'text', text: String(btn.text) }],
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to, // E.164 sin '+', ej: 52155XXXXXXX
    type: 'template',
    template: {
      name: template,
      language: { code: lang },
      ...(components.length ? { components } : {}),
    },
  };

  console.log('📡 Enviando a WhatsApp API:', {
    url: WA_BASE(phoneId),
    template: template,
    to: to,
    lang: lang
  });
  
  const res = await fetch(WA_BASE(phoneId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('❌ WhatsApp API Error:', {
      status: res.status,
      statusText: res.statusText,
      error: errorText
    });
    throw new Error(`WhatsApp error ${res.status}: ${errorText}`);
  }
  
  const response = await res.json();
  console.log('✅ WhatsApp API Success:', response);
  return response;
}

/**
 * Enviar TEXTO LIBRE (requiere ventana de 24h abierta)
 */
export async function sendWhatsText({ to, text }) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) throw new Error('Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_ID');

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  };

  const res = await fetch(WA_BASE(phoneId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`WhatsApp error ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Conveniencia: enviar tu OTP con la plantilla aprobada "otp_code_1" (Spanish All)
 */
export async function sendOtpCode({ to, code }) {
  console.log('🚀 sendOtpCode llamado con:', { to, code });
  
  try {
    const result = await sendWhatsTemplate({
      to,                         // E.164 sin '+', ej: 52155XXXXXXXX
      template: 'otp_code_1',     // nombre exacto
      lang: 'es',                 // Spanish (All)
      bodyParams: [{ type: 'text', text: String(code) }], // {{1}} = code
      urlButtons: [{ index: 0, text: code }]      // {{1}} del BOTÓN URL
    });
    
    console.log('✅ WhatsApp API Response:', result);
    return result;
  } catch (error) {
    console.error('❌ Error en sendOtpCode:', error);
    throw error;
  }
}

/**
 * Conveniencia: enviar OTP de recuperación con plantilla "recovery_otp" (Spanish All)
 */
export async function sendRecoveryOtp({ to, code }) {
  return sendWhatsTemplate({
    to,
    template: 'recovery_otp', // nombre de la nueva plantilla
    lang: 'es',
    bodyParams: [{ type: 'text', text: String(code) }], // {{1}} = code
    urlButtons: [{ index: 0, text: code }]      // {{1}} del BOTÓN URL
  });
}