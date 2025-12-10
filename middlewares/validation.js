// ═══════════════════════════════════════════════════════════════════════
// ✅ MIDDLEWARE DE VALIDACIÓN
// ═══════════════════════════════════════════════════════════════════════
// Validación de datos con express-validator
// ═══════════════════════════════════════════════════════════════════════

import { body, param, query, validationResult } from 'express-validator';
import { isValidMongoId } from './security.js';

// ═══════════════════════════════════════════════════════════════════════
// 1. HELPER PARA MANEJAR ERRORES DE VALIDACIÓN
// ═══════════════════════════════════════════════════════════════════════

/**
 * Middleware para verificar errores de validación
 * Se usa después de las reglas de validación
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));
    
    console.warn('⚠️ Errores de validación:', {
      ip: req.ip,
      path: req.path,
      errors: formattedErrors
    });
    
    return res.status(400).json({
      message: 400,
      message_text: 'Errores de validación',
      errors: formattedErrors
    });
  }
  
  next();
};

// ═══════════════════════════════════════════════════════════════════════
// 2. VALIDACIONES DE USUARIO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validación para registro de usuario
 */
export const validateUserRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio')
    .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('El nombre solo puede contener letras'),
  
  body('surname')
    .trim()
    .notEmpty().withMessage('El apellido es obligatorio')
    .isLength({ min: 2, max: 50 }).withMessage('El apellido debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('El apellido solo puede contener letras'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('El email es obligatorio')
    .isEmail().withMessage('Debe ser un email válido')
    .normalizeEmail()
    .isLength({ max: 100 }).withMessage('El email es demasiado largo'),
  
  body('password')
    .notEmpty().withMessage('La contraseña es obligatoria')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/[A-Z]/).withMessage('La contraseña debe contener al menos una mayúscula')
    .matches(/[a-z]/).withMessage('La contraseña debe contener al menos una minúscula')
    .matches(/[0-9]/).withMessage('La contraseña debe contener al menos un número'),
  
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9+\-\s()]+$/).withMessage('Formato de teléfono inválido')
    .isLength({ min: 8, max: 20 }).withMessage('El teléfono debe tener entre 8 y 20 caracteres'),
  
  body('rol')
    .optional()
    .isIn(['admin', 'instructor', 'cliente']).withMessage('Rol inválido'),
  
  handleValidationErrors
];

/**
 * Validación para login
 */
export const validateUserLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('El email es obligatorio')
    .isEmail().withMessage('Debe ser un email válido')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('La contraseña es obligatoria'),
  
  handleValidationErrors
];

/**
 * Validación para actualización de usuario
 */
export const validateUserUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('El nombre solo puede contener letras'),
  
  body('surname')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('El apellido debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('El apellido solo puede contener letras'),
  
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Debe ser un email válido')
    .normalizeEmail(),
  
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9+\-\s()]+$/).withMessage('Formato de teléfono inválido')
    .isLength({ min: 8, max: 20 }).withMessage('El teléfono debe tener entre 8 y 20 caracteres'),
  
  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/[A-Z]/).withMessage('La contraseña debe contener al menos una mayúscula')
    .matches(/[a-z]/).withMessage('La contraseña debe contener al menos una minúscula')
    .matches(/[0-9]/).withMessage('La contraseña debe contener al menos un número'),
  
  body('rol')
    .optional()
    .isIn(['admin', 'instructor', 'cliente']).withMessage('Rol inválido'),
  
  handleValidationErrors
];

// ═══════════════════════════════════════════════════════════════════════
// 3. VALIDACIONES DE CURSO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validación para crear/actualizar curso
 */
export const validateCourse = [
  body('title')
    .trim()
    .notEmpty().withMessage('El título es obligatorio')
    .isLength({ min: 5, max: 200 }).withMessage('El título debe tener entre 5 y 200 caracteres'),
  
  body('subtitle')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 300 }).withMessage('El subtítulo es demasiado largo'),
  
  body('categorie')
    .notEmpty().withMessage('La categoría es obligatoria')
    .custom((value) => {
      if (!isValidMongoId(value)) {
        throw new Error('ID de categoría inválido');
      }
      return true;
    }),
  
  body('price_usd')
    .notEmpty().withMessage('El precio es obligatorio')
    .isFloat({ min: 0, max: 10000 }).withMessage('El precio debe ser un número entre 0 y 10000'),
  
  body('level')
    .optional()
    .isIn(['Básico', 'Intermedio', 'Avanzado']).withMessage('Nivel inválido'),
  
  body('idioma')
    .optional()
    .isIn(['Español', 'Inglés']).withMessage('Idioma inválido'),
  
  body('state')
    .optional()
    .isInt({ min: 1, max: 3 }).withMessage('Estado inválido (1=Borrador, 2=Público, 3=Anulado)'),
  
  handleValidationErrors
];

// ═══════════════════════════════════════════════════════════════════════
// 4. VALIDACIONES DE PROYECTO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validación para crear/actualizar proyecto
 */
export const validateProject = [
  body('title')
    .trim()
    .notEmpty().withMessage('El título es obligatorio')
    .isLength({ min: 5, max: 200 }).withMessage('El título debe tener entre 5 y 200 caracteres'),
  
  body('price_usd')
    .notEmpty().withMessage('El precio es obligatorio')
    .isFloat({ min: 0, max: 10000 }).withMessage('El precio debe ser un número entre 0 y 10000'),
  
  body('state')
    .optional()
    .isInt({ min: 1, max: 3 }).withMessage('Estado inválido'),
  
  handleValidationErrors
];

// ═══════════════════════════════════════════════════════════════════════
// 5. VALIDACIONES DE REVIEW
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validación para crear review
 */
export const validateReview = [
  body('course')
    .notEmpty().withMessage('El ID del curso es obligatorio')
    .custom((value) => {
      if (!isValidMongoId(value)) {
        throw new Error('ID de curso inválido');
      }
      return true;
    }),
  
  body('rating')
    .notEmpty().withMessage('La calificación es obligatoria')
    .isInt({ min: 1, max: 5 }).withMessage('La calificación debe ser entre 1 y 5'),
  
  body('comment')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('El comentario es demasiado largo (máx 1000 caracteres)'),
  
  handleValidationErrors
];

/**
 * Validación para responder review
 */
export const validateReviewReply = [
  body('reply')
    .trim()
    .notEmpty().withMessage('La respuesta es obligatoria')
    .isLength({ min: 10, max: 1000 }).withMessage('La respuesta debe tener entre 10 y 1000 caracteres'),
  
  handleValidationErrors
];

// ═══════════════════════════════════════════════════════════════════════
// 6. VALIDACIONES DE CATEGORÍA
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validación para crear/actualizar categoría
 */
export const validateCategory = [
  body('title')
    .trim()
    .notEmpty().withMessage('El título es obligatorio')
    .isLength({ min: 3, max: 100 }).withMessage('El título debe tener entre 3 y 100 caracteres'),
  
  body('state')
    .optional()
    .isBoolean().withMessage('El estado debe ser true o false'),
  
  handleValidationErrors
];

// ═══════════════════════════════════════════════════════════════════════
// 7. VALIDACIONES DE VENTA
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validación para actualizar estado de venta
 */
export const validateSaleStatusUpdate = [
  param('id')
    .custom((value) => {
      if (!isValidMongoId(value)) {
        throw new Error('ID de venta inválido');
      }
      return true;
    }),
  
  body('status')
    .notEmpty().withMessage('El estado es obligatorio')
    .isIn(['pendiente', 'procesando', 'completada', 'cancelada', 'reembolsada'])
    .withMessage('Estado inválido'),
  
  handleValidationErrors
];

// ═══════════════════════════════════════════════════════════════════════
// 8. VALIDACIONES DE MONGODB ID
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validación genérica de MongoDB ID en params
 * @param {string} paramName - Nombre del parámetro (default: 'id')
 */
export const validateMongoId = (paramName = 'id') => [
  param(paramName)
    .custom((value) => {
      if (!isValidMongoId(value)) {
        throw new Error(`ID inválido: ${paramName}`);
      }
      return true;
    }),
  
  handleValidationErrors
];

/**
 * Validación de MongoDB ID en query params
 * @param {string} queryName - Nombre del query param
 */
export const validateMongoIdQuery = (queryName) => [
  query(queryName)
    .optional()
    .custom((value) => {
      if (value && !isValidMongoId(value)) {
        throw new Error(`ID inválido: ${queryName}`);
      }
      return true;
    }),
  
  handleValidationErrors
];

// ═══════════════════════════════════════════════════════════════════════
// 9. VALIDACIONES DE REEMBOLSO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validación para solicitar reembolso
 */
export const validateRefundRequest = [
  body('sale')
    .notEmpty().withMessage('El ID de la venta es obligatorio')
    .custom((value) => {
      if (!isValidMongoId(value)) {
        throw new Error('ID de venta inválido');
      }
      return true;
    }),
  
  body('reason')
    .trim()
    .notEmpty().withMessage('La razón del reembolso es obligatoria')
    .isLength({ min: 20, max: 500 }).withMessage('La razón debe tener entre 20 y 500 caracteres'),
  
  handleValidationErrors
];

/**
 * Validación para completar reembolso
 */
export const validateRefundCompletion = [
  body('receipt_number')
    .trim()
    .notEmpty().withMessage('El número de comprobante es obligatorio')
    .isLength({ min: 5, max: 50 }).withMessage('Número de comprobante inválido'),
  
  handleValidationErrors
];

// ═══════════════════════════════════════════════════════════════════════
// 10. VALIDACIONES DE DESCUENTO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validación para crear/actualizar descuento
 */
export const validateDiscount = [
  body('code')
    .trim()
    .notEmpty().withMessage('El código es obligatorio')
    .isLength({ min: 3, max: 20 }).withMessage('El código debe tener entre 3 y 20 caracteres')
    .matches(/^[A-Z0-9-_]+$/).withMessage('El código solo puede contener letras mayúsculas, números, guiones y guiones bajos'),
  
  body('type_discount')
    .notEmpty().withMessage('El tipo de descuento es obligatorio')
    .isInt({ min: 1, max: 2 }).withMessage('Tipo inválido (1=Porcentaje, 2=Monto fijo)'),
  
  body('discount')
    .notEmpty().withMessage('El valor del descuento es obligatorio')
    .isFloat({ min: 0 }).withMessage('El descuento debe ser mayor o igual a 0'),
  
  body('num_use')
    .optional()
    .isInt({ min: 1 }).withMessage('El número de usos debe ser mayor a 0'),
  
  handleValidationErrors
];

// ═══════════════════════════════════════════════════════════════════════
// EXPORTACIONES
// ═══════════════════════════════════════════════════════════════════════

export default {
  // Helper
  handleValidationErrors,
  
  // Usuario
  validateUserRegister,
  validateUserLogin,
  validateUserUpdate,
  
  // Curso
  validateCourse,
  
  // Proyecto
  validateProject,
  
  // Review
  validateReview,
  validateReviewReply,
  
  // Categoría
  validateCategory,
  
  // Venta
  validateSaleStatusUpdate,
  
  // MongoDB IDs
  validateMongoId,
  validateMongoIdQuery,
  
  // Reembolso
  validateRefundRequest,
  validateRefundCompletion,
  
  // Descuento
  validateDiscount
};
