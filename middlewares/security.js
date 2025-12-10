// ═══════════════════════════════════════════════════════════════════════
// 🔒 MIDDLEWARE DE SEGURIDAD
// ═══════════════════════════════════════════════════════════════════════
// Funciones de sanitización, validación y protección contra ataques
// ═══════════════════════════════════════════════════════════════════════

import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import fs from 'fs';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// ═══════════════════════════════════════════════════════════════════════
// 1. SANITIZACIÓN DE BÚSQUEDAS (Prevenir NoSQL Injection)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Sanitiza un input de búsqueda para prevenir NoSQL Injection
 * @param {string} input - Texto a sanitizar
 * @returns {string} Texto sanitizado
 */
export const sanitizeSearchInput = (input) => {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Escapar caracteres especiales de regex
  const sanitized = input
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escapar metacaracteres
    .replace(/\$/g, '') // Eliminar $ (operador MongoDB)
    .substring(0, 100); // Limitar longitud (prevenir ReDoS)

  return sanitized.trim();
};

/**
 * Middleware para sanitizar query params de búsqueda
 * @param {string[]} fields - Campos a sanitizar
 */
export const sanitizeQuery = (fields = ['search', 'q', 'query']) => {
  return (req, res, next) => {
    fields.forEach(field => {
      if (req.query[field]) {
        req.query[field] = sanitizeSearchInput(req.query[field]);
      }
    });
    next();
  };
};

// ═══════════════════════════════════════════════════════════════════════
// 2. SANITIZACIÓN DE HTML (Prevenir XSS)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Sanitiza HTML para prevenir XSS
 * @param {string} dirty - HTML sucio/peligroso
 * @returns {string} HTML limpio
 */
export const sanitizeHtml = (dirty) => {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'i', 'b',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'blockquote', 'code', 'pre',
      'span', 'div'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'class'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    // Forzar target="_blank" en links externos
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
  });
};

/**
 * Sanitiza solo texto plano (remueve TODO el HTML)
 * @param {string} text - Texto con posible HTML
 * @returns {string} Solo texto plano
 */
export const sanitizePlainText = (text) => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
};

// ═══════════════════════════════════════════════════════════════════════
// 3. VALIDACIÓN DE ARCHIVOS (Prevenir carga de malware)
// ═══════════════════════════════════════════════════════════════════════

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Valida que un archivo sea una imagen válida
 * @param {Object} file - Archivo de multer/multiparty
 * @returns {Promise<boolean>}
 * @throws {Error} Si el archivo no es válido
 */
export const validateImageUpload = async (file) => {
  if (!file || !file.path) {
    throw new Error('No se proporcionó ningún archivo');
  }

  // Validar tamaño
  const stats = fs.statSync(file.path);
  if (stats.size > MAX_IMAGE_SIZE) {
    fs.unlinkSync(file.path); // Eliminar archivo
    throw new Error(`Archivo demasiado grande. Máximo ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
  }

  // Validar tipo MIME real (no confiar en extensión)
  const type = await fileTypeFromFile(file.path);
  if (!type || !ALLOWED_IMAGE_TYPES.includes(type.mime)) {
    fs.unlinkSync(file.path);
    throw new Error('Tipo de archivo no permitido. Solo se permiten imágenes JPG, PNG, WebP y GIF');
  }

  try {
    // Reprocesar imagen para eliminar metadatos maliciosos y validar que es imagen real
    const safePath = `${file.path}_safe.${type.ext}`;
    await sharp(file.path)
      .resize(2000, 2000, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .toFile(safePath);

    // Reemplazar archivo original
    fs.unlinkSync(file.path);
    fs.renameSync(safePath, file.path);

    return true;
  } catch (error) {
    // Si sharp falla, el archivo no es una imagen válida
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    throw new Error('El archivo no es una imagen válida o está corrupto');
  }
};

/**
 * Valida que un archivo sea un documento PDF válido
 * @param {Object} file - Archivo de multer/multiparty
 * @returns {Promise<boolean>}
 * @throws {Error} Si el archivo no es válido
 */
export const validateDocumentUpload = async (file) => {
  if (!file || !file.path) {
    throw new Error('No se proporcionó ningún archivo');
  }

  // Validar tamaño
  const stats = fs.statSync(file.path);
  if (stats.size > MAX_DOCUMENT_SIZE) {
    fs.unlinkSync(file.path);
    throw new Error(`Archivo demasiado grande. Máximo ${MAX_DOCUMENT_SIZE / 1024 / 1024}MB`);
  }

  // Validar tipo MIME real
  const type = await fileTypeFromFile(file.path);
  if (!type || !ALLOWED_DOCUMENT_TYPES.includes(type.mime)) {
    fs.unlinkSync(file.path);
    throw new Error('Tipo de archivo no permitido. Solo se permiten PDFs');
  }

  return true;
};

// ═══════════════════════════════════════════════════════════════════════
// 4. LOGGING SEGURO (No exponer información sensible)
// ═══════════════════════════════════════════════════════════════════════

const SENSITIVE_FIELDS = [
  'password', 'otp', 'token', 'access_token', 'refresh_token',
  'credit_card', 'cvv', 'ssn', 'social_security',
  'api_key', 'secret', 'private_key'
];

/**
 * Sanitiza un objeto para logging (remueve campos sensibles)
 * @param {Object} obj - Objeto a sanitizar
 * @returns {Object} Objeto sanitizado
 */
export const sanitizeForLog = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

  const sanitizeRecursive = (target) => {
    for (const key in target) {
      if (typeof target[key] === 'object' && target[key] !== null) {
        sanitizeRecursive(target[key]);
      } else if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field))) {
        target[key] = '[REDACTED]';
      }
    }
  };

  sanitizeRecursive(sanitized);
  return sanitized;
};

/**
 * Logger seguro con niveles
 * @param {string} level - Nivel: 'info', 'warn', 'error'
 * @param {string} message - Mensaje
 * @param {Object} meta - Metadata adicional (será sanitizada)
 */
export const secureLog = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const sanitizedMeta = sanitizeForLog(meta);

  const logEntry = {
    timestamp,
    level,
    message,
    ...sanitizedMeta
  };

  switch (level) {
    case 'error':
      console.error(`❌ [${timestamp}]`, message, sanitizedMeta);
      break;
    case 'warn':
      console.warn(`⚠️ [${timestamp}]`, message, sanitizedMeta);
      break;
    case 'info':
    default:
      console.log(`ℹ️ [${timestamp}]`, message, sanitizedMeta);
  }

  // Aquí podrías agregar integración con Winston, Datadog, etc.
};

// ═══════════════════════════════════════════════════════════════════════
// 5. VALIDACIÓN DE IPs Y USER AGENTS
// ═══════════════════════════════════════════════════════════════════════

const SUSPICIOUS_USER_AGENTS = [
  'curl', 'wget', 'python-requests', 'scrapy', 'bot',
  'spider', 'crawler', 'scanner', 'nikto', 'sqlmap'
];

/**
 * Detecta user agents sospechosos
 * @param {string} userAgent - User agent del request
 * @returns {boolean} True si es sospechoso
 */
export const isSuspiciousUserAgent = (userAgent) => {
  if (!userAgent) return false;

  const lowerAgent = userAgent.toLowerCase();
  return SUSPICIOUS_USER_AGENTS.some(suspicious =>
    lowerAgent.includes(suspicious)
  );
};

/**
 * Middleware para detectar actividad sospechosa
 */
export const detectSuspiciousActivity = (req, res, next) => {
  const userAgent = req.get('user-agent') || '';

  if (isSuspiciousUserAgent(userAgent)) {
    secureLog('warn', 'User agent sospechoso detectado', {
      ip: req.ip,
      userAgent,
      path: req.path,
      method: req.method
    });
  }

  // Detectar intentos de acceso a rutas de admin sin autenticación
  if (req.path.includes('/admin') && !req.headers.authorization) {
    secureLog('warn', 'Intento de acceso a admin sin autenticación', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent
    });
  }

  next();
};

// ═══════════════════════════════════════════════════════════════════════
// 6. VALIDACIÓN DE MONGODB IDs
// ═══════════════════════════════════════════════════════════════════════

/**
 * Valida que un string sea un ObjectId válido de MongoDB
 * @param {string} id - ID a validar
 * @returns {boolean}
 */
export const isValidMongoId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Middleware para validar MongoDB IDs en params
 * @param {string} paramName - Nombre del parámetro (ej: 'id', 'courseId')
 */
export const validateMongoIdParam = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!isValidMongoId(id)) {
      return res.status(400).json({
        message: 400,
        message_text: `ID inválido: ${paramName}`
      });
    }

    next();
  };
};

// ═══════════════════════════════════════════════════════════════════════
// 7. PREVENCIÓN DE TIMING ATTACKS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Agrega un delay aleatorio para prevenir timing attacks
 * Útil en endpoints de login/verificación
 */
export const preventTimingAttack = async () => {
  const delay = Math.floor(Math.random() * 100) + 50; // 50-150ms
  await new Promise(resolve => setTimeout(resolve, delay));
};

// ═══════════════════════════════════════════════════════════════════════
// 8. PROTECCIÓN CONTRA MASS ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Filtra campos no permitidos del body (prevenir mass assignment)
 * @param {Object} body - req.body
 * @param {string[]} allowedFields - Campos permitidos
 * @returns {Object} Body filtrado
 */
export const filterAllowedFields = (body, allowedFields) => {
  const filtered = {};

  allowedFields.forEach(field => {
    if (body[field] !== undefined) {
      filtered[field] = body[field];
    }
  });

  return filtered;
};

/**
 * Middleware para filtrar campos permitidos
 * @param {string[]} allowedFields - Campos permitidos
 */
export const allowOnlyFields = (allowedFields) => {
  return (req, res, next) => {
    req.body = filterAllowedFields(req.body, allowedFields);
    next();
  };
};

// ═══════════════════════════════════════════════════════════════════════
// EXPORTACIONES
// ═══════════════════════════════════════════════════════════════════════

export default {
  // Sanitización
  sanitizeSearchInput,
  sanitizeQuery,
  sanitizeHtml,
  sanitizePlainText,

  // Validación de archivos
  validateImageUpload,
  validateDocumentUpload,

  // Logging
  sanitizeForLog,
  secureLog,

  // Detección de amenazas
  isSuspiciousUserAgent,
  detectSuspiciousActivity,

  // Validación MongoDB
  isValidMongoId,
  validateMongoIdParam,

  // Protección de timing attacks
  preventTimingAttack,

  // Mass assignment
  filterAllowedFields,
  allowOnlyFields
};
