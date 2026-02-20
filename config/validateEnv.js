// config/validateEnv.js

export function validateEnvironment() {
  console.log('🔍 Validando variables de entorno...\n');

  const errors = [];
  const warnings = [];

  // Variables requeridas
  const requiredVars = {
    'MONGO_URI':        'Conexión a base de datos',
    'JWT_SECRETO':      'Secret para tokens JWT',
    'PUERTO':           'Puerto del servidor',
    'URL_BACKEND':      'URL del backend',
    'URL_FRONTEND':     'URL del frontend',
    'STRIPE_SECRET_KEY':'Stripe Secret Key (sk_...)',
    'TELEGRAM_TOKEN':   'Token del bot de Telegram',
    'NODE_ENV':         'Entorno de ejecución'
  };

  Object.entries(requiredVars).forEach(([varName, description]) => {
    if (!process.env[varName]) {
      errors.push(`❌ ${varName} - ${description}`);
    }
  });

  // JWT_SECRETO fuerte
  if (process.env.JWT_SECRETO) {
    const jwtSecret = process.env.JWT_SECRETO;
    if (jwtSecret.length < 32) {
      errors.push('❌ JWT_SECRETO debe tener al menos 32 caracteres');
    }
    const weakSecrets = ['secret','12345','password','super-secreto','mi-secreto','jwt-secret'];
    if (weakSecrets.some(w => jwtSecret.toLowerCase().includes(w))) {
      errors.push('❌ JWT_SECRETO es demasiado predecible');
    }
  }

  // MONGO_URI contraseña débil (advertencia)
  const checkWeakMongoPassword = (uri, varName) => {
    if (uri && (uri.includes(':123@') || uri.includes(':password@') || uri.includes(':admin@'))) {
      warnings.push(`⚠️  ${varName} parece contener una contraseña débil`);
    }
  };
  if (process.env.MONGO_URI)      checkWeakMongoPassword(process.env.MONGO_URI, 'MONGO_URI');
  if (process.env.MONGO_URILOCAL) checkWeakMongoPassword(process.env.MONGO_URILOCAL, 'MONGO_URILOCAL');

  // NODE_ENV válido
  if (process.env.NODE_ENV) {
    if (!['development','production','test'].includes(process.env.NODE_ENV)) {
      warnings.push(`⚠️  NODE_ENV="${process.env.NODE_ENV}" no es un valor estándar`);
    }
  }

  // URLs válidas
  ['URL_BACKEND','URL_FRONTEND'].forEach(varName => {
    if (process.env[varName]) {
      try { new URL(process.env[varName]); }
      catch (e) { errors.push(`❌ ${varName} no es una URL válida`); }
    }
  });

  // Stripe: advertir si falta la publishable key (no crítica para el backend)
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    warnings.push('⚠️  STRIPE_PUBLISHABLE_KEY no configurada (necesaria para el frontend)');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    warnings.push('⚠️  STRIPE_WEBHOOK_SECRET no configurada (necesaria para webhooks)');
  }

  // Stripe en producción con modo test
  if (process.env.NODE_ENV === 'production') {
    const secretKey = process.env.STRIPE_SECRET_KEY || '';
    if (secretKey.startsWith('sk_test_')) {
      warnings.push('⚠️  Usando Stripe en modo TEST en producción. Cambia a sk_live_...');
    }
  }

  // Opcionales recomendadas
  const optionalVars = {
    'TELEGRAM_CHAT_ID': 'Chat ID de Telegram'
  };
  Object.entries(optionalVars).forEach(([varName, description]) => {
    if (!process.env[varName]) warnings.push(`⚠️  ${varName} no configurado - ${description}`);
  });

  // ── Resultados ──────────────────────────────────────────────────────────
  console.log('='.repeat(70));
  console.log('RESULTADO DE VALIDACIÓN');
  console.log('='.repeat(70));

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Todas las variables de entorno están configuradas correctamente\n');
    return true;
  }

  if (errors.length > 0) {
    console.log('\n🔴 ERRORES CRÍTICOS:\n');
    errors.forEach(e => console.log(e));
    console.log('\n⛔ La aplicación NO puede iniciarse con estos errores\n');
    console.log('='.repeat(70));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('\n🟡 ADVERTENCIAS:\n');
    warnings.forEach(w => console.log(w));
    console.log('\nLa aplicación puede iniciar, pero revisa estas configuraciones\n');
  }

  console.log('='.repeat(70) + '\n');
  return true;
}

export async function generateJWTSecret() {
  const crypto = await import('crypto');
  return crypto.randomBytes(64).toString('hex');
}

export function showEnvInfo() {
  console.log('\n📋 INFORMACIÓN DE ENTORNO:\n');
  console.log(`   Entorno:        ${process.env.NODE_ENV || 'no especificado'}`);
  console.log(`   Puerto:         ${process.env.PUERTO || 'no especificado'}`);
  console.log(`   Backend:        ${process.env.URL_BACKEND || 'no especificado'}`);
  console.log(`   Frontend:       ${process.env.URL_FRONTEND || 'no especificado'}`);
  console.log(`   Stripe mode:    ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test'}`);
  console.log('');
}

export default { validateEnvironment, generateJWTSecret, showEnvInfo };
