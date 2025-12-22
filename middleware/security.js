// middleware/security.js
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';

/**
 * Configura todos los middlewares de seguridad
 */
export function setupSecurityMiddleware(app) {
  console.log('🔒 Configurando middlewares de seguridad...');

  // 1. Helmet - Headers de seguridad HTTP
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval para Angular en dev
        imgSrc: ["'self'", "data:", "https:", "http:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https://api.paypal.com", "https://www.paypal.com"],
        frameSrc: ["'self'", "https://www.paypal.com", "https://player.vimeo.com"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 año
      includeSubDomains: true,
      preload: true
    },
    frameguard: {
      action: 'deny' // Prevenir clickjacking
    },
    noSniff: true, // Prevenir MIME sniffing
    xssFilter: true, // Habilitar filtro XSS del navegador
  }));

  // 2. Sanitización contra NoSQL injection
  app.use(mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
      console.warn(`⚠️  [SEGURIDAD] Intento de NoSQL injection detectado en "${key}" desde IP: ${req.ip}`);
    },
  }));

  // 3. Ocultar tecnología del servidor
  app.disable('x-powered-by');

  // 4. Rate limiting para prevenir ataques de fuerza bruta
  
  // Rate limiter general (100 requests por 15 minutos)
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: {
      error: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // No aplicar rate limit en desarrollo
      return process.env.NODE_ENV === 'development';
    }
  });

  // Rate limiter estricto para autenticación (5 intentos por 15 minutos)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
      error: 'Demasiados intentos de inicio de sesión, intenta de nuevo en 15 minutos.'
    },
    skipSuccessfulRequests: true, // No contar requests exitosos
  });

  // Rate limiter para registro (3 registros por hora)
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3,
    message: {
      error: 'Demasiados intentos de registro, intenta de nuevo en 1 hora.'
    }
  });

  // Rate limiter para recuperación de contraseña (3 intentos por hora)
  const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: {
      error: 'Demasiadas solicitudes de recuperación de contraseña, intenta de nuevo en 1 hora.'
    }
  });

  // Aplicar rate limiters
  app.use('/api', generalLimiter);
  app.use('/api/users/login', authLimiter);
  app.use('/api/users/register', registerLimiter);
  app.use('/api/users/forgot-password', passwordResetLimiter);
  app.use('/api/users/reset-password', passwordResetLimiter);

  console.log('✅ Middlewares de seguridad configurados');
}

export default {
  setupSecurityMiddleware
};
