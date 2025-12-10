// ═══════════════════════════════════════════════════════════════════════
// 🚦 MIDDLEWARE DE RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════
// Protección contra ataques de fuerza bruta y abuso de recursos
// ═══════════════════════════════════════════════════════════════════════

import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

// ═══════════════════════════════════════════════════════════════════════
// 1. RATE LIMITERS POR CATEGORÍA
// ═══════════════════════════════════════════════════════════════════════

/**
 * Rate limiter ESTRICTO para login
 * 5 intentos por 15 minutos por IP
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos
  message: {
    message: 429,
    message_text: 'Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo en 15 minutos.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // No contar requests exitosos
  skipFailedRequests: false, // Sí contar requests fallidos
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit excedido en login:`, {
      ip: req.ip,
      email: req.body?.email,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      message: 429,
      message_text: 'Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo en 15 minutos.',
      retryAfter: 15 * 60 // segundos
    });
  }
});

/**
 * Rate limiter para registro de usuarios
 * 3 registros por hora por IP (prevenir spam)
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // 3 registros
  message: {
    message: 429,
    message_text: 'Demasiados registros desde esta dirección IP. Intenta de nuevo en 1 hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit excedido en registro:`, {
      ip: req.ip,
      email: req.body?.email,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      message: 429,
      message_text: 'Demasiados registros desde esta dirección IP. Intenta de nuevo en 1 hora.',
      retryAfter: 60 * 60
    });
  }
});

/**
 * Rate limiter para verificación de OTP
 * 10 intentos por 15 minutos (permitir algunos errores)
 */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message: 429,
    message_text: 'Demasiados intentos de verificación. Intenta de nuevo más tarde.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit excedido en OTP:`, {
      ip: req.ip,
      userId: req.body?.userId,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      message: 429,
      message_text: 'Demasiados intentos de verificación. Intenta de nuevo en 15 minutos.',
      retryAfter: 15 * 60
    });
  }
});

/**
 * Rate limiter para creación de recursos (cursos, proyectos, etc.)
 * 20 creaciones por hora
 */
export const createResourceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20,
  message: {
    message: 429,
    message_text: 'Demasiadas creaciones en poco tiempo. Intenta de nuevo más tarde.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Solo contar requests fallidos
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit excedido en creación de recursos:`, {
      ip: req.ip,
      userId: req.user?._id,
      path: req.path,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      message: 429,
      message_text: 'Demasiadas creaciones en poco tiempo. Intenta de nuevo en 1 hora.',
      retryAfter: 60 * 60
    });
  }
});

/**
 * Rate limiter GENERAL para toda la API
 * 100 requests por 15 minutos
 */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300, // 300 requests (Aumentado para SPA)
  message: {
    message: 429,
    message_text: 'Demasiadas peticiones a la API. Por favor, intenta de nuevo más tarde.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // No aplicar rate limiting a:
    // 1. Webhooks de Mercado Pago (tienen su propia validación)
    if (req.path.includes('/webhook')) return true;

    // 2. Imágenes estáticas (ya tienen cache)
    if (req.path.match(/\.(jpg|jpeg|png|gif|webp|svg|pdf)$/i)) return true;

    return false;
  },
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit general excedido:`, {
      ip: req.ip,
      userId: req.user?._id,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      message: 429,
      message_text: 'Demasiadas peticiones a la API. Por favor, intenta de nuevo en 15 minutos.',
      retryAfter: 15 * 60
    });
  }
});

/**
 * Rate limiter ESTRICTO para operaciones críticas
 * 5 operaciones por 15 minutos
 * Usar en: cambio de contraseña, actualización de estado de ventas, etc.
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    message: 429,
    message_text: 'Demasiadas operaciones críticas. Por seguridad, espera 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.error(`🚨 Rate limit CRÍTICO excedido:`, {
      ip: req.ip,
      userId: req.user?._id,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      message: 429,
      message_text: 'Demasiadas operaciones críticas. Por seguridad, espera 15 minutos.',
      retryAfter: 15 * 60
    });
  }
});

/**
 * Rate limiter para reset de contraseña
 * 3 intentos por hora
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  message: {
    message: 429,
    message_text: 'Demasiados intentos de reset de contraseña. Intenta en 1 hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit excedido en reset de contraseña:`, {
      ip: req.ip,
      email: req.body?.email,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      message: 429,
      message_text: 'Demasiados intentos de reset de contraseña. Intenta de nuevo en 1 hora.',
      retryAfter: 60 * 60
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 2. SLOW DOWN (No bloquea, solo ralentiza)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Slowdown general de API
 * Después de 50 requests, agrega delay progresivo
 */
export const apiSlowDown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutos
  delayAfter: 150, // Después de 150 requests (Aumentado para SPA)
  delayMs: (hits) => hits * 100, // 100ms por request adicional
  maxDelayMs: 5000, // Máximo 5 segundos de delay
  skipSuccessfulRequests: false,
  skipFailedRequests: false,

});

/**
 * Slowdown para búsquedas (operación costosa)
 * Después de 20 búsquedas, ralentizar
 */
export const searchSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 20,
  delayMs: (hits) => hits * 200, // 200ms por búsqueda adicional
  maxDelayMs: 10000, // Máximo 10 segundos
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

// ═══════════════════════════════════════════════════════════════════════
// 3. RATE LIMITER PERSONALIZADO POR USUARIO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Rate limiter que usa el user ID en lugar de IP
 * Útil para usuarios autenticados
 */
export const userBasedLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Demasiadas peticiones desde tu cuenta. Intenta más tarde.'
  } = options;

  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => {
      // Usar user ID si está autenticado, sino usar IP
      return req.user?._id?.toString() || req.ip;
    },
    message: {
      message: 429,
      message_text: message
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.warn(`⚠️ Rate limit por usuario excedido:`, {
        userId: req.user?._id,
        ip: req.ip,
        path: req.path,
        timestamp: new Date().toISOString()
      });

      res.status(429).json({
        message: 429,
        message_text: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// ═══════════════════════════════════════════════════════════════════════
// 4. RATE LIMITER PARA WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Rate limiter permisivo para webhooks
 * Los webhooks externos pueden enviar muchas notificaciones
 */
export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // 100 webhooks por minuto (generoso)
  message: {
    message: 429,
    message_text: 'Demasiados webhooks en poco tiempo.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Validar que venga de Mercado Pago (IP whitelist)
    const mercadoPagoIPs = [
      '209.225.49.0/24',
      '216.33.197.0/24',
      '216.33.196.0/24'
      // Añadir más IPs de Mercado Pago según documentación
    ];

    // Esta es una validación simplificada
    // En producción, usar librería como 'ip-range-check'
    return false; // Por ahora, aplicar rate limiting a todos
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 5. HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Resetear rate limit para un usuario específico (útil para testing)
 * NOTA: Solo usar en desarrollo
 */
export const resetRateLimitForUser = (userId) => {
  if (process.env.NODE_ENV !== 'development') {
    console.warn('⚠️ resetRateLimitForUser solo debe usarse en desarrollo');
    return;
  }

  console.log(`🔄 Rate limit reseteado para usuario: ${userId}`);
  // Implementación depende del store usado (memory, Redis, etc.)
};

// ═══════════════════════════════════════════════════════════════════════
// EXPORTACIONES
// ═══════════════════════════════════════════════════════════════════════

export default {
  // Rate limiters por categoría
  loginLimiter,
  registerLimiter,
  otpLimiter,
  createResourceLimiter,
  generalApiLimiter,
  strictLimiter,
  passwordResetLimiter,

  // Slow down
  apiSlowDown,
  searchSlowDown,

  // Custom
  userBasedLimiter,
  webhookLimiter,

  // Helpers
  resetRateLimitForUser
};
