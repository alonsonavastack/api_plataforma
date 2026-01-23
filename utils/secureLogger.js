// ═══════════════════════════════════════════════════════════════════════
// 🔒 SECURE LOGGER - Sistema de logging seguro
// ═══════════════════════════════════════════════════════════════════════
// Evita loguear información sensible como contraseñas, tokens, teléfonos, etc.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Campos considerados sensibles que deben ser redactados
 */
const SENSITIVE_FIELDS = [
  'password',
  'otp',
  'token',
  'access_token',
  'refresh_token',
  'jwt',
  'secret',
  'api_key',
  'private_key',
  'credit_card',
  'cvv',
  'ssn',
  'authorization',
  'cookie',
  'session'
];

/**
 * Campos que contienen información personal sensible (para GDPR/privacidad)
 */
const PII_FIELDS = [
  'phone',
  'email',
  'address',
  'dni',
  'passport'
];

/**
 * Redacta información sensible de un objeto
 * @param {any} data - Datos a sanitizar
 * @param {boolean} hidePII - Si se debe ocultar información personal
 * @returns {any} - Datos sanitizados
 */
const redactSensitiveData = (data, hidePII = false) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Si es un array, procesar cada elemento
  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item, hidePII));
  }

  // Crear copia del objeto
  const sanitized = { ...data };

  // Redactar campos sensibles
  Object.keys(sanitized).forEach(key => {
    const lowerKey = key.toLowerCase();
    
    // Verificar si es un campo sensible
    const isSensitive = SENSITIVE_FIELDS.some(field => 
      lowerKey.includes(field)
    );
    
    // Verificar si es PII y debe ocultarse
    const isPII = hidePII && PII_FIELDS.some(field => 
      lowerKey.includes(field)
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (isPII) {
      // Para PII, mostrar solo primeros y últimos caracteres
      const value = String(sanitized[key]);
      if (value.length > 4) {
        sanitized[key] = `${value.substring(0, 2)}***${value.substring(value.length - 2)}`;
      } else {
        sanitized[key] = '***';
      }
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      // Recursivamente sanitizar objetos anidados
      sanitized[key] = redactSensitiveData(sanitized[key], hidePII);
    }
  });

  return sanitized;
};

/**
 * Niveles de logging
 */
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

/**
 * Logger seguro
 */
class SecureLogger {
  constructor(options = {}) {
    this.hidePII = options.hidePII || process.env.NODE_ENV === 'production';
    this.minLevel = options.minLevel || LOG_LEVELS.INFO;
  }

  /**
   * Log de error
   */
  error(message, data = {}) {
    this._log(LOG_LEVELS.ERROR, message, data, '❌');
  }

  /**
   * Log de advertencia
   */
  warn(message, data = {}) {
    this._log(LOG_LEVELS.WARN, message, data, '⚠️');
  }

  /**
   * Log de información
   */
  info(message, data = {}) {
    this._log(LOG_LEVELS.INFO, message, data, 'ℹ️');
  }

  /**
   * Log de debug (solo en desarrollo)
   */
  debug(message, data = {}) {
    if (process.env.NODE_ENV === 'development') {
      this._log(LOG_LEVELS.DEBUG, message, data, '🔍');
    }
  }

  /**
   * Log de éxito
   */
  success(message, data = {}) {
    this._log(LOG_LEVELS.INFO, message, data, '✅');
  }

  /**
   * Método interno de logging
   */
  _log(level, message, data, emoji) {
    const timestamp = new Date().toISOString();
    const sanitizedData = redactSensitiveData(data, this.hidePII);
    
    const logEntry = {
      timestamp,
      level,
      message,
      ...(Object.keys(sanitizedData).length > 0 && { data: sanitizedData })
    };

    // Formatear salida
    const dataStr = Object.keys(sanitizedData).length > 0 
      ? JSON.stringify(sanitizedData, null, 2)
      : '';

    switch (level) {
      case LOG_LEVELS.ERROR:
// SILENCIADO: // SILENCIADO(`${emoji} [${timestamp}] ${message}`, dataStr);
        break;
      case LOG_LEVELS.WARN:
// SILENCIADO: // SILENCIADO(`${emoji} [${timestamp}] ${message}`, dataStr);
        break;
      case LOG_LEVELS.INFO:
      case LOG_LEVELS.DEBUG:
      default:
// SILENCIADO: // SILENCIADO(`${emoji} [${timestamp}] ${message}`, dataStr);
    }

    // Aquí podrías agregar integración con servicios externos
    // como Winston, Datadog, CloudWatch, etc.
  }

  /**
   * Log de operaciones de usuario (auto-redacta PII)
   */
  userAction(action, userId, details = {}) {
    this.info(`Usuario realizó acción: ${action}`, {
      userId,
      action,
      ...details
    });
  }

  /**
   * Log de operaciones de seguridad
   */
  security(event, details = {}) {
    this.warn(`Evento de seguridad: ${event}`, details);
  }
}

// Crear instancia singleton
const logger = new SecureLogger({
  hidePII: process.env.NODE_ENV === 'production',
  minLevel: LOG_LEVELS.INFO
});

// Exportar tanto la clase como la instancia
export { SecureLogger, LOG_LEVELS, redactSensitiveData };
export default logger;
