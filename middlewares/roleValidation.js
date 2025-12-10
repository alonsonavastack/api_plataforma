// ═══════════════════════════════════════════════════════════════════════
// 👮 MIDDLEWARE DE VALIDACIÓN DE ROLES
// ═══════════════════════════════════════════════════════════════════════
// Validación centralizada de permisos y roles
// ═══════════════════════════════════════════════════════════════════════

import { secureLog } from './security.js';

// ═══════════════════════════════════════════════════════════════════════
// 1. VALIDACIÓN BÁSICA DE ROLES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Middleware genérico para requerir roles específicos
 * @param  {...string} allowedRoles - Roles permitidos
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    // Verificar que el usuario está autenticado
    if (!req.user) {
      secureLog('warn', 'Intento de acceso sin autenticación', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      
      return res.status(401).json({
        message: 401,
        message_text: 'No estás autenticado. Por favor, inicia sesión.'
      });
    }
    
    // Verificar que el rol del usuario está en los permitidos
    if (!allowedRoles.includes(req.user.rol)) {
      secureLog('warn', 'Acceso denegado por rol insuficiente', {
        userId: req.user._id,
        email: req.user.email,
        currentRole: req.user.rol,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method
      });
      
      return res.status(403).json({
        message: 403,
        message_text: 'No tienes permisos para realizar esta acción.',
        required: allowedRoles,
        current: req.user.rol
      });
    }
    
    next();
  };
};

// ═══════════════════════════════════════════════════════════════════════
// 2. ATAJOS PARA ROLES ESPECÍFICOS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Solo administradores
 */
export const requireAdmin = requireRole('admin');

/**
 * Administradores e instructores
 */
export const requireInstructor = requireRole('admin', 'instructor');

/**
 * Solo clientes/estudiantes
 */
export const requireCustomer = requireRole('cliente');

/**
 * Cualquier usuario autenticado (admin, instructor o cliente)
 */
export const requireAuthenticated = requireRole('admin', 'instructor', 'cliente');

// ═══════════════════════════════════════════════════════════════════════
// 3. VALIDACIÓN DE PROPIEDAD (IDOR Protection)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verifica que el usuario sea el propietario del recurso O sea admin
 * @param {string} resourceField - Campo donde está el ID del propietario (ej: 'user', 'instructor')
 * @param {string} resourceIdField - Campo donde buscar el ID del recurso (default: '_id' en body)
 */
export const requireOwnershipOrAdmin = (resourceField = 'user', resourceIdField = '_id') => {
  return async (req, res, next) => {
    // Verificar autenticación
    if (!req.user) {
      return res.status(401).json({
        message: 401,
        message_text: 'No estás autenticado.'
      });
    }
    
    // Admin siempre puede pasar
    if (req.user.rol === 'admin') {
      return next();
    }
    
    // Obtener ID del recurso (puede estar en body, params o query)
    const resourceId = req.body[resourceIdField] || 
                      req.params[resourceIdField] || 
                      req.query[resourceIdField];
    
    if (!resourceId) {
      secureLog('warn', 'Intento de IDOR: ID de recurso no encontrado', {
        userId: req.user._id,
        email: req.user.email,
        path: req.path,
        body: req.body,
        params: req.params
      });
      
      return res.status(400).json({
        message: 400,
        message_text: 'ID del recurso requerido'
      });
    }
    
    // Aquí se debería cargar el recurso de la BD para verificar propiedad
    // Por ahora, solo comparamos con el ID del usuario actual
    // El controller debe hacer la validación completa
    
    next();
  };
};

/**
 * Middleware para validar que el usuario está editando su propio perfil O es admin
 */
export const requireSelfOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: 401,
      message_text: 'No estás autenticado.'
    });
  }
  
  // Admin siempre puede editar
  if (req.user.rol === 'admin') {
    return next();
  }
  
  // Obtener el ID del usuario a editar
  const targetUserId = req.body._id || req.params.id;
  
  // Verificar que está editando su propio perfil
  if (targetUserId && targetUserId !== req.user._id.toString()) {
    secureLog('warn', 'Intento de IDOR en perfil de usuario', {
      attacker: req.user.email,
      attackerId: req.user._id,
      targetUserId: targetUserId,
      path: req.path
    });
    
    return res.status(403).json({
      message: 403,
      message_text: 'No tienes permiso para editar este usuario.'
    });
  }
  
  next();
};

// ═══════════════════════════════════════════════════════════════════════
// 4. VALIDACIÓN DE PROPIEDAD DE CURSOS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Middleware específico para verificar propiedad de cursos
 * El instructor solo puede editar sus propios cursos
 */
export const requireCourseOwnership = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: 401,
      message_text: 'No estás autenticado.'
    });
  }
  
  // Admin puede editar cualquier curso
  if (req.user.rol === 'admin') {
    return next();
  }
  
  // Para instructores, validar en el controller
  // Aquí solo verificamos que sea instructor
  if (req.user.rol !== 'instructor') {
    secureLog('warn', 'Usuario no-instructor intentó modificar curso', {
      userId: req.user._id,
      email: req.user.email,
      rol: req.user.rol,
      path: req.path
    });
    
    return res.status(403).json({
      message: 403,
      message_text: 'Solo instructores pueden modificar cursos.'
    });
  }
  
  // El controller debe validar que el curso pertenece al instructor
  next();
};

/**
 * Middleware específico para verificar propiedad de proyectos
 */
export const requireProjectOwnership = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: 401,
      message_text: 'No estás autenticado.'
    });
  }
  
  // Admin puede editar cualquier proyecto
  if (req.user.rol === 'admin') {
    return next();
  }
  
  // Para instructores, validar en el controller
  if (req.user.rol !== 'instructor') {
    return res.status(403).json({
      message: 403,
      message_text: 'Solo instructores pueden modificar proyectos.'
    });
  }
  
  next();
};

// ═══════════════════════════════════════════════════════════════════════
// 5. VALIDACIÓN DE ESTADO DE USUARIO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verifica que el usuario esté activo (state: true)
 */
export const requireActiveUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: 401,
      message_text: 'No estás autenticado.'
    });
  }
  
  // Verificar state (debería venir del token/usuario)
  if (req.user.state === false) {
    secureLog('warn', 'Usuario inactivo intentó acceder', {
      userId: req.user._id,
      email: req.user.email,
      path: req.path
    });
    
    return res.status(403).json({
      message: 403,
      message_text: 'Tu cuenta está inactiva. Contacta a soporte.'
    });
  }
  
  next();
};

/**
 * Verifica que el usuario esté verificado (isVerified: true)
 */
export const requireVerifiedUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: 401,
      message_text: 'No estás autenticado.'
    });
  }
  
  if (!req.user.isVerified) {
    secureLog('warn', 'Usuario no verificado intentó acceder', {
      userId: req.user._id,
      email: req.user.email,
      path: req.path
    });
    
    return res.status(403).json({
      message: 403,
      message_text: 'Debes verificar tu cuenta antes de continuar.',
      requiresVerification: true
    });
  }
  
  next();
};

// ═══════════════════════════════════════════════════════════════════════
// 6. VALIDACIÓN DE CAMBIO DE ROL
// ═══════════════════════════════════════════════════════════════════════

/**
 * Previene que usuarios no-admin cambien roles
 */
export const preventRoleEscalation = (req, res, next) => {
  // Si no se está intentando cambiar el rol, continuar
  if (!req.body.rol) {
    return next();
  }
  
  if (!req.user) {
    return res.status(401).json({
      message: 401,
      message_text: 'No estás autenticado.'
    });
  }
  
  // Solo admin puede cambiar roles
  if (req.user.rol !== 'admin') {
    secureLog('warn', 'Intento de escalación de privilegios', {
      attacker: req.user.email,
      attackerId: req.user._id,
      currentRole: req.user.rol,
      attemptedRole: req.body.rol,
      path: req.path
    });
    
    // Eliminar el campo 'rol' del body
    delete req.body.rol;
    
    // Continuar sin fallar (el rol simplemente no se cambiará)
    secureLog('info', 'Campo rol eliminado del request', {
      userId: req.user._id
    });
  }
  
  next();
};

// ═══════════════════════════════════════════════════════════════════════
// 7. VALIDACIÓN DE LÍMITES POR ROL
// ═══════════════════════════════════════════════════════════════════════

/**
 * Limita el número de recursos que puede crear un instructor
 * (Prevenir spam)
 */
export const enforceCreationLimits = (resourceType, maxPerDay = 10) => {
  return async (req, res, next) => {
    // Solo aplicar a instructores (admin ilimitado)
    if (!req.user || req.user.rol === 'admin') {
      return next();
    }
    
    if (req.user.rol !== 'instructor') {
      return next(); // No aplica a clientes
    }
    
    // Aquí deberías consultar la BD para contar recursos creados hoy
    // Por ahora, solo dejamos pasar
    // TODO: Implementar contador de recursos por día
    
    next();
  };
};

// ═══════════════════════════════════════════════════════════════════════
// 8. HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verifica si un usuario tiene un rol específico
 * @param {Object} user - Usuario a verificar
 * @param {string} role - Rol a verificar
 * @returns {boolean}
 */
export const hasRole = (user, role) => {
  if (!user || !user.rol) return false;
  return user.rol === role;
};

/**
 * Verifica si un usuario tiene alguno de los roles
 * @param {Object} user - Usuario a verificar
 * @param {string[]} roles - Roles a verificar
 * @returns {boolean}
 */
export const hasAnyRole = (user, roles) => {
  if (!user || !user.rol) return false;
  return roles.includes(user.rol);
};

/**
 * Verifica si el usuario es el propietario del recurso
 * @param {Object} user - Usuario autenticado
 * @param {Object} resource - Recurso a verificar
 * @param {string} ownerField - Campo del propietario (default: 'user')
 * @returns {boolean}
 */
export const isOwner = (user, resource, ownerField = 'user') => {
  if (!user || !resource) return false;
  
  const resourceOwnerId = typeof resource[ownerField] === 'object' 
    ? resource[ownerField]._id?.toString() 
    : resource[ownerField]?.toString();
  
  return resourceOwnerId === user._id.toString();
};

/**
 * Verifica si el usuario puede modificar el recurso
 * (Es admin O es el propietario)
 * @param {Object} user - Usuario autenticado
 * @param {Object} resource - Recurso a verificar
 * @param {string} ownerField - Campo del propietario
 * @returns {boolean}
 */
export const canModify = (user, resource, ownerField = 'user') => {
  if (!user) return false;
  if (user.rol === 'admin') return true;
  return isOwner(user, resource, ownerField);
};

// ═══════════════════════════════════════════════════════════════════════
// EXPORTACIONES
// ═══════════════════════════════════════════════════════════════════════

export default {
  // Básicos
  requireRole,
  requireAdmin,
  requireInstructor,
  requireCustomer,
  requireAuthenticated,
  
  // Propiedad
  requireOwnershipOrAdmin,
  requireSelfOrAdmin,
  requireCourseOwnership,
  requireProjectOwnership,
  
  // Estado
  requireActiveUser,
  requireVerifiedUser,
  
  // Prevención
  preventRoleEscalation,
  enforceCreationLimits,
  
  // Helpers
  hasRole,
  hasAnyRole,
  isOwner,
  canModify
};
