import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { initializeSocketIO } from './services/socket.service.js';

// ═══════════════════════════════════════════════════════════════════════
// 🔐 VALIDACIÓN DE ENTORNO (DEBE SER LO PRIMERO)
// ═══════════════════════════════════════════════════════════════════════
import { validateEnvironment, showEnvInfo } from './config/validateEnv.js';

// Validar variables de entorno ANTES de iniciar
validateEnvironment();
showEnvInfo();

// ═══════════════════════════════════════════════════════════════════════
// 🔒 IMPORTS DE SEGURIDAD
// ═══════════════════════════════════════════════════════════════════════

import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import { generalApiLimiter, apiSlowDown } from './middlewares/rateLimiters.js';
import { sanitizeQuery, detectSuspiciousActivity } from './middlewares/security.js';

// ═══════════════════════════════════════════════════════════════════════
// 🚀 INICIALIZACIÓN DE EXPRESS
// ═══════════════════════════════════════════════════════════════════════

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════
// 🔐 CONFIGURACIÓN DE SEGURIDAD (Fase 1: Headers)
// ═══════════════════════════════════════════════════════════════════════

// 1. HELMET - Headers de seguridad HTTP
app.use(helmet({
    // Content Security Policy
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'", // Solo para desarrollo
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://fonts.googleapis.com"
            ],
            imgSrc: [
                "'self'",
                "data:",
                "https:",
                "blob:"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com"
            ],
            connectSrc: [
                "'self'",
                "https://api.paypal.com",
                "wss://localhost:3000",
                "wss://localhost:4200", // WebSockets dev
                process.env.NODE_ENV === 'production' ? "wss://api.tudominio.com" : ""
            ].filter(Boolean),
            frameSrc: [
                "'self'",
                "https://www.paypal.com",
                "https://www.sandbox.paypal.com"
            ],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    },

    // HTTP Strict Transport Security (HSTS)
    hsts: {
        maxAge: 31536000, // 1 año
        includeSubDomains: true,
        preload: true
    },

    // Prevenir clickjacking
    frameguard: {
        action: 'deny'
    },

    // Prevenir MIME sniffing
    noSniff: true,

    // Deshabilitar header X-Powered-By
    hidePoweredBy: true,

    // Prevenir que el navegador abra downloads automáticamente
    ieNoOpen: true,

    // DNS Prefetch Control
    dnsPrefetchControl: {
        allow: false
    },

    // Referrer Policy
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
    },

    // 🔓 PERMITIR CARGA DE IMÁGENES CROSS-ORIGIN
    // Necesario para que el frontend (localhost:4200) pueda ver imágenes del backend (localhost:3000)
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

console.log('✅ Helmet configurado');

// ═══════════════════════════════════════════════════════════════════════
// 🌐 CONFIGURACIÓN DE CORS
// ═══════════════════════════════════════════════════════════════════════

const allowedOrigins = [
    'http://localhost:4200', // Angular dev
    'http://127.0.0.1:4200', // Angular dev (IP)
    'http://localhost:3000', // Backend dev
    'http://localhost:3001', // Frontend alternativo
    process.env.URL_FRONTEND_NGROK, // 🔥 ngrok para PayPal OAuth (frontend)
    // Añadir dominios de producción aquí
    // 'https://tudominio.com',
    // 'https://www.tudominio.com',
    // 'https://app.tudominio.com',
].filter(Boolean); // Filtrar valores undefined

const corsOptions = {
    origin: (origin, callback) => {
        // Permitir requests sin origen (apps móviles, Postman, etc.)
        if (!origin) {
            return callback(null, true);
        }

        // 🔥 Permitir TODOS los subdominios de ngrok-free.dev
        if (origin.endsWith('.ngrok-free.dev')) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`🚫 CORS bloqueado: ${origin}`);
            callback(new Error('No permitido por CORS'));
        }
    },
    credentials: true, // Permitir cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-CSRF-Token'
    ],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400, // Cache preflight 24h
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Manejar errores de CORS
app.use((err, req, res, next) => {
    if (err.message === 'No permitido por CORS') {
        return res.status(403).json({
            message: 403,
            message_text: 'Acceso no permitido desde este origen'
        });
    }
    next(err);
});

console.log('✅ CORS configurado');

// ═══════════════════════════════════════════════════════════════════════
// 🛡️ PROTECCIÓN CONTRA ATAQUES (Fase 2)
// ═══════════════════════════════════════════════════════════════════════

// Prevenir NoSQL Injection
app.use(mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
        console.warn(`⚠️ Intento de NoSQL Injection detectado en: ${key}`, {
            ip: req.ip,
            path: req.path
        });
    }
}));

// Prevenir HTTP Parameter Pollution
app.use(hpp({
    whitelist: ['search', 'category', 'tag', 'sort'] // Permitir múltiples valores
}));

// Sanitizar query strings
app.use('/api/', sanitizeQuery(['search', 'q', 'query', 'email', 'name']));

// Detectar actividad sospechosa
app.use(detectSuspiciousActivity);

console.log('✅ Protecciones anti-ataque configuradas');

// ═══════════════════════════════════════════════════════════════════════
// ⏱️ RATE LIMITING (Fase 3)
// ═══════════════════════════════════════════════════════════════════════

// Rate limiting general (100 req / 15 min)
app.use('/api/', generalApiLimiter);

// Slowdown (ralentiza después de 50 req)
app.use('/api/', apiSlowDown);

console.log('✅ Rate limiting configurado');

// ═══════════════════════════════════════════════════════════════════════
// 📦 PARSING DE BODY
// ═══════════════════════════════════════════════════════════════════════

// Limitar tamaño del body
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf, encoding) => {
        if (buf.length > 10 * 1024 * 1024) { // 10MB
            throw new Error('Body demasiado grande');
        }
    }
}));

app.use(express.urlencoded({
    extended: true,
    limit: '10mb',
    parameterLimit: 100 // Máximo 100 parámetros
}));

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

console.log('✅ Parsers configurados');

// ═══════════════════════════════════════════════════════════════════════
// 📊 LOGGING DE REQUESTS (Development) - SIN INFORMACIÓN SENSIBLE
// ═══════════════════════════════════════════════════════════════════════

if (process.env.NODE_ENV === 'development') {
app.use((req, res, next) => {
const timestamp = new Date().toISOString();
// 🔒 NO loguear body, headers con tokens, ni passwords
const safeLog = {
    method: req.method,
        path: req.path,
            ip: req.ip
        };
        console.log(`[${timestamp}] ${safeLog.method} ${safeLog.path}`);
        next();
    });
}

// ═══════════════════════════════════════════════════════════════════════
// 🗄️ CONEXIÓN A LA BASE DE DATOS (Top-Level Await)
// ═══════════════════════════════════════════════════════════════════════

mongoose.Promise = global.Promise;
const dbUrl = process.env.MONGO_URI;

// Variables para router y controller que se importarán dinámicamente
let router;
let ShortUrlController;
let server;

try {
    await mongoose.connect(dbUrl, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    console.log('✅ Conectado a la base de datos MongoDB.');

    // Intentar inicializar CRON jobs
    try {
        const { initializeCronJobs } = await import('./cron/index.js');
        initializeCronJobs();
        console.log('✅ CRON jobs inicializados');
    } catch (error) {
        console.log('\n⚠️  CRON jobs no inicializados (opcional)');
        console.log('   El sistema funcionará normalmente sin CRON jobs automáticos.\n');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🛣️ RUTAS (Carga dinámica después de DB)
    // ═══════════════════════════════════════════════════════════════════════

    // Importar dinámicamente para asegurar que los modelos se carguen DESPUÉS de la conexión
    const routerModule = await import('./router/index.js');
    router = routerModule.default;

    const shortUrlModule = await import('./controllers/ShortUrlController.js');
    ShortUrlController = shortUrlModule.default;

    // Ruta de Short URLs (debe ir ANTES de /api/)
    app.get('/s/:shortCode', ShortUrlController.redirect);

    // Rutas principales de la API
    app.use('/api/', router);

    // Ruta de health check (útil para monitoreo)
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development'
        });
    });

    console.log('✅ Rutas configuradas');

    // ═══════════════════════════════════════════════════════════════════════
    // ❌ MANEJO DE ERRORES
    // ═══════════════════════════════════════════════════════════════════════

    // Ruta no encontrada
    app.use((req, res) => {
        res.status(404).json({
            message: 404,
            message_text: 'Ruta no encontrada',
            path: req.path
        });
    });

    // Manejo global de errores
    app.use((err, req, res, next) => {
        const isDevelopment = process.env.NODE_ENV === 'development';

        // 🔒 Loguear error SIN información sensible
        console.error('❌ Error capturado:', {
            message: err.message,
            stack: isDevelopment ? err.stack : undefined,
            path: req.path,
            method: req.method,
            ip: req.ip,
            // 🔒 NO loguear user completo, solo email si existe
            userEmail: req.user ? req.user.email : 'no autenticado',
            timestamp: new Date().toISOString()
        });

        // Respuesta al cliente (sin detalles sensibles en producción)
        res.status(err.status || 500).json({
            message: err.status || 500,
            message_text: isDevelopment
                ? err.message
                : 'Error interno del servidor',
            ...(isDevelopment && { stack: err.stack }),
            timestamp: new Date().toISOString()
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 🔧 CONFIGURACIÓN ADICIONAL
    // ═══════════════════════════════════════════════════════════════════════

    // Desactivar X-Powered-By (redundante con Helmet)
    app.disable('x-powered-by');

    // Trust proxy si estás detrás de Nginx/Cloudflare
    if (process.env.NODE_ENV === 'production') {
        app.set('trust proxy', 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🚀 INICIAR SERVIDOR
    // ═══════════════════════════════════════════════════════════════════════

    app.set('port', process.env.PUERTO || 3000);

    // Crear servidor HTTP
    const httpServer = createServer(app);

    // Inicializar Socket.IO
    initializeSocketIO(httpServer);

    // Iniciar servidor
    server = httpServer.listen(app.get('port'), () => {
        console.log('\n═══════════════════════════════════════════════════');
        console.log('🚀 SERVIDOR INICIADO');
        console.log('═══════════════════════════════════════════════════');
        console.log(`📡 Puerto: ${app.get('port')}`);
        console.log(`🔌 WebSocket: ws://localhost:${app.get('port')}`);
        console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔐 Seguridad: ACTIVADA`);
        console.log('═══════════════════════════════════════════════════\n');
    });

} catch (err) {
    console.error('❌ Error conectando a MongoDB o iniciando servidor:', err);
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// 🛑 MANEJO DE CIERRE GRACEFUL
// ═══════════════════════════════════════════════════════════════════════

const gracefulShutdown = async (signal) => {
    console.log(`\n⚠️  ${signal} recibido. Cerrando servidor...`);

    try {
        // Detener CRON jobs si existen
        const { stopAllCronJobs } = await import('./cron/index.js');
        stopAllCronJobs();
        console.log('✅ CRON jobs detenidos');
    } catch (error) {
        // CRON jobs no disponibles
    }

    // Cerrar servidor HTTP
    if (server) {
        await new Promise((resolve) => {
            server.close(() => {
                console.log('✅ Servidor cerrado correctamente');
                resolve();
            });
        });
    }

    // Cerrar conexión a MongoDB
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close(false);
        console.log('✅ MongoDB desconectado');
    }

    process.exit(0);

    // Forzar cierre después de 10 segundos
    setTimeout(() => {
        console.error('⚠️  Cierre forzado después de 10 segundos');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT (Ctrl+C)'));

// Capturar errores no manejados
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

export default app;
