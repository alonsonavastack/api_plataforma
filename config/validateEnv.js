// config/validateEnv.js

/**
 * Valida que todas las variables de entorno críticas estén configuradas
 * y cumplan con los requisitos de seguridad
 */
export function validateEnvironment() {
  console.log('🔍 Validando variables de entorno...\n');

  const errors = [];
  const warnings = [];

  // Variables requeridas
  const requiredVars = {
    'MONGO_URI': 'Conexión a base de datos',
    'JWT_SECRETO': 'Secret para tokens JWT',
    'PUERTO': 'Puerto del servidor',
    'URL_BACKEND': 'URL del backend',
    'URL_FRONTEND': 'URL del frontend',
    'PAYPAL_CLIENT_ID': 'PayPal Client ID',
    'PAYPAL_CLIENT_SECRET': 'PayPal Client Secret',
    'TELEGRAM_TOKEN': 'Token del bot de Telegram',
    'NODE_ENV': 'Entorno de ejecución'
  };

  // Verificar variables requeridas
  Object.entries(requiredVars).forEach(([varName, description]) => {
    if (!process.env[varName]) {
      errors.push(`❌ ${varName} - ${description}`);
    }
  });

  // Validaciones de seguridad específicas

  // 1. JWT_SECRETO debe ser fuerte
  if (process.env.JWT_SECRETO) {
    const jwtSecret = process.env.JWT_SECRETO;

    if (jwtSecret.length < 32) {
      errors.push('❌ JWT_SECRETO debe tener al menos 32 caracteres para seguridad');
    }

    // Verificar que no sea un secret conocido o débil
    const weakSecrets = [
      'secret',
      '12345',
      'password',
      'super-secreto',
      'mi-secreto',
      'jwt-secret',
      'super-secreto-largo'
    ];

    if (weakSecrets.some(weak => jwtSecret.toLowerCase().includes(weak))) {
      errors.push('❌ JWT_SECRETO es demasiado predecible. Usa: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    }
  }

  // 2. MONGO_URI no debe incluir contraseñas débiles
  const checkWeakMongoPassword = (uri, varName) => {
    if (uri && (
      uri.includes(':123@') ||
      uri.includes(':password@') ||
      uri.includes(':admin@'))) {
      warnings.push(`⚠️  ${varName} parece contener una contraseña débil`);
    }
  };

  if (process.env.MONGO_URI) {
    checkWeakMongoPassword(process.env.MONGO_URI, 'MONGO_URI');
  }

  if (process.env.MONGO_URILOCAL) {
    checkWeakMongoPassword(process.env.MONGO_URILOCAL, 'MONGO_URILOCAL');
  }

  // 3. NODE_ENV debe ser válido
  if (process.env.NODE_ENV) {
    const validEnvs = ['development', 'production', 'test'];
    if (!validEnvs.includes(process.env.NODE_ENV)) {
      warnings.push(`⚠️  NODE_ENV="${process.env.NODE_ENV}" no es un valor estándar. Usa: ${validEnvs.join(', ')}`);
    }
  }

  // 4. Verificar que las URLs sean válidas
  const urlVars = ['URL_BACKEND', 'URL_FRONTEND'];
  urlVars.forEach(varName => {
    if (process.env[varName]) {
      try {
        new URL(process.env[varName]);
      } catch (e) {
        errors.push(`❌ ${varName} no es una URL válida`);
      }
    }
  });

  // 5. PAYPAL_MODE debe ser válido
  if (process.env.PAYPAL_MODE) {
    if (!['sandbox', 'live'].includes(process.env.PAYPAL_MODE)) {
      warnings.push('⚠️  PAYPAL_MODE debe ser "sandbox" o "live"');
    }

    if (process.env.NODE_ENV === 'production' && process.env.PAYPAL_MODE === 'sandbox') {
      warnings.push('⚠️  Usando PayPal en modo SANDBOX en producción');
    }
  }

  // 6. Variables opcionales pero recomendadas
  const optionalVars = {
    'VIMEO_TOKEN': 'Token de Vimeo para videos',
    'YOUTUBE_API_KEY': 'API Key de YouTube',
    'TELEGRAM_CHAT_ID': 'Chat ID de Telegram'
  };

  Object.entries(optionalVars).forEach(([varName, description]) => {
    if (!process.env[varName]) {
      warnings.push(`⚠️  ${varName} no configurado - ${description}`);
    }
  });

  // Mostrar resultados
  console.log('='.repeat(70));
  console.log('RESULTADO DE VALIDACIÓN');
  console.log('='.repeat(70));

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Todas las variables de entorno están configuradas correctamente\n');
    return true;
  }

  // Mostrar errores críticos
  if (errors.length > 0) {
    console.log('\n🔴 ERRORES CRÍTICOS:\n');
    errors.forEach(error => console.log(error));
    console.log('\n⛔ La aplicación NO puede iniciarse con estos errores\n');
    console.log('='.repeat(70));
    process.exit(1);
  }

  // Mostrar advertencias
  if (warnings.length > 0) {
    console.log('\n🟡 ADVERTENCIAS:\n');
    warnings.forEach(warning => console.log(warning));
    console.log('\nLa aplicación puede iniciar, pero revisa estas configuraciones\n');
  }

  console.log('='.repeat(70) + '\n');
  return true;
}

/**
 * Genera un nuevo JWT_SECRET fuerte
 */
export async function generateJWTSecret() {
  const crypto = await import('crypto');
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Muestra información sobre las variables de entorno
 */
export function showEnvInfo() {
  console.log('\n📋 INFORMACIÓN DE ENTORNO:\n');
  console.log(`   Entorno: ${process.env.NODE_ENV || 'no especificado'}`);
  console.log(`   Puerto: ${process.env.PUERTO || 'no especificado'}`);
  console.log(`   Backend: ${process.env.URL_BACKEND || 'no especificado'}`);
  console.log(`   Frontend: ${process.env.URL_FRONTEND || 'no especificado'}`);
  console.log(`   PayPal Mode: ${process.env.PAYPAL_MODE || 'no especificado'}`);
  // 🔒 LOG REMOVIDO POR SEGURIDAD
  console.log('');
}

export default {
  validateEnvironment,
  generateJWTSecret,
  showEnvInfo
};
