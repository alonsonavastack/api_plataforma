/**
 * 🔧 Helper para generar slugs únicos
 * Normaliza texto a formato URL-friendly y maneja duplicados
 */

/**
 * Normaliza un texto a formato slug (URL-friendly)
 * - Convierte a minúsculas
 * - Remueve acentos y caracteres especiales
 * - Reemplaza espacios con guiones
 * - Elimina caracteres no permitidos
 * 
 * @param {string} text - Texto a convertir en slug
 * @returns {string} Slug normalizado
 */
export function normalizeToSlug(text) {
    if (!text) return '';
    
    return text
        .toString()
        .toLowerCase()
        .trim()
        // Remover acentos
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Reemplazar espacios y caracteres especiales con guiones
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        // Eliminar múltiples guiones consecutivos
        .replace(/-+/g, '-')
        // Eliminar guiones al inicio y final
        .replace(/^-+|-+$/g, '');
}

/**
 * Genera un slug único para un usuario
 * Si el slug ya existe, agrega un sufijo numérico
 * 
 * @param {Object} User - Modelo de Mongoose User
 * @param {string} name - Nombre del usuario
 * @param {string} surname - Apellido del usuario
 * @param {string} existingSlug - Slug existente (para actualizaciones)
 * @returns {Promise<string>} Slug único generado
 */
export async function generateUniqueSlug(User, name, surname, existingSlug = null) {
    // Generar slug base desde nombre completo
    const fullName = `${name} ${surname}`;
    let baseSlug = normalizeToSlug(fullName);
    
    // Si no hay texto válido, usar 'usuario' como base
    if (!baseSlug) {
        baseSlug = 'usuario';
    }
    
    // Si ya existe un slug y no ha cambiado el nombre, mantenerlo
    if (existingSlug) {
        const existingBaseSlug = existingSlug.replace(/-\d+$/, '');
        const currentBaseSlug = baseSlug;
        
        // Si el slug base no cambió, mantener el existente
        if (existingBaseSlug === currentBaseSlug) {
            return existingSlug;
        }
    }
    
    // Verificar si el slug ya existe
    let slug = baseSlug;
    let counter = 1;
    let slugExists = true;
    
    while (slugExists) {
        // Buscar si el slug ya está en uso (excluyendo el slug actual si existe)
        const query = existingSlug 
            ? { slug: slug, slug: { $ne: existingSlug } }
            : { slug: slug };
            
        const existingUser = await User.findOne(query).lean();
        
        if (!existingUser) {
            slugExists = false;
        } else {
            // Agregar sufijo numérico
            counter++;
            slug = `${baseSlug}-${counter}`;
        }
        
        // Límite de seguridad para evitar bucles infinitos
        if (counter > 1000) {
            // Agregar timestamp como fallback
            slug = `${baseSlug}-${Date.now()}`;
            break;
        }
    }
    
    return slug;
}

/**
 * Valida que un slug tenga el formato correcto
 * 
 * @param {string} slug - Slug a validar
 * @returns {boolean} true si es válido, false si no
 */
export function isValidSlug(slug) {
    if (!slug) return false;
    
    // Solo letras minúsculas, números y guiones
    // No puede empezar o terminar con guión
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    
    return slugPattern.test(slug) && slug.length <= 100;
}

/**
 * Genera un slug corto único basado en un ID
 * Útil como fallback cuando no hay nombre/apellido
 * 
 * @param {string} userId - ID del usuario
 * @returns {string} Slug corto generado
 */
export function generateShortSlug(userId) {
    // Tomar los últimos 8 caracteres del ID
    const shortId = userId.toString().slice(-8);
    return `user-${shortId}`;
}
