/**
 * UTILIDAD PARA MANEJO DE FECHAS
 * Funciones auxiliares para operaciones con fechas en el sistema de pagos
 */

/**
 * Agrega días a una fecha
 * @param {Date|string} date - Fecha base
 * @param {number} days - Número de días a agregar (puede ser negativo)
 * @returns {Date} Nueva fecha con los días agregados
 */
export function addDays(date, days) {
    // Validar que days sea un número
    if (typeof days !== 'number') {
        throw new Error('days debe ser un número');
    }

    // Convertir a Date si es string
    const baseDate = typeof date === 'string' ? new Date(date) : new Date(date);
    
    // Validar que sea una fecha válida
    if (isNaN(baseDate.getTime())) {
        throw new Error('Fecha inválida');
    }

    const result = new Date(baseDate);
    result.setDate(result.getDate() + days);
    
    return result;
}

/**
 * Verifica si una ganancia (earning) ya está disponible para pago
 * @param {Object} earning - Objeto earning con available_at y status
 * @returns {boolean} true si está disponible, false si no
 */
export function isAvailable(earning) {
    if (!earning) {
        return false;
    }

    // Si ya está marcado como available o paid, retornar true
    if (earning.status === 'available' || earning.status === 'paid') {
        return earning.status === 'available'; // Solo available es elegible para pago
    }

    // Si está en pending, verificar la fecha
    if (earning.status === 'pending' && earning.available_at) {
        const now = new Date();
        const availableDate = new Date(earning.available_at);
        return now >= availableDate;
    }

    return false;
}

/**
 * Calcula la fecha disponible para un earning
 * @param {Date|string} earnedAt - Fecha en que se ganó
 * @param {number} daysUntilAvailable - Días de espera hasta estar disponible
 * @returns {Date} Fecha en que estará disponible
 */
export function calculateAvailableDate(earnedAt, daysUntilAvailable = 7) {
    return addDays(earnedAt, daysUntilAvailable);
}

/**
 * Calcula cuántos días faltan para que un earning esté disponible
 * @param {Date|string} availableAt - Fecha en que estará disponible
 * @returns {number} Días restantes (0 si ya está disponible, negativo si pasó)
 */
export function daysUntilAvailable(availableAt) {
    const now = new Date();
    const available = new Date(availableAt);
    
    // Calcular diferencia en milisegundos
    const diffMs = available - now;
    
    // Convertir a días
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    // Si ya pasó la fecha, retornar 0
    return Math.max(0, diffDays);
}

/**
 * Formatea una fecha a string legible
 * @param {Date|string} date - Fecha a formatear
 * @param {string} locale - Locale para el formato (default: 'es-MX')
 * @returns {string} Fecha formateada
 */
export function formatDate(date, locale = 'es-MX') {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
        return 'Fecha inválida';
    }

    return dateObj.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Formatea una fecha con hora
 * @param {Date|string} date - Fecha a formatear
 * @param {string} locale - Locale para el formato (default: 'es-MX')
 * @returns {string} Fecha y hora formateadas
 */
export function formatDateTime(date, locale = 'es-MX') {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
        return 'Fecha inválida';
    }

    return dateObj.toLocaleString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Obtiene el rango de fechas para un período
 * @param {string} period - 'today', 'week', 'month', 'year', 'all'
 * @returns {Object} Objeto con startDate y endDate
 */
export function getDateRange(period) {
    const now = new Date();
    const endDate = new Date(now);
    let startDate = new Date(now);

    switch (period) {
        case 'today':
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        
        case 'week':
            // Último 7 días
            startDate = addDays(now, -7);
            break;
        
        case 'month':
            // Último 30 días
            startDate = addDays(now, -30);
            break;
        
        case 'year':
            // Último año
            startDate = addDays(now, -365);
            break;
        
        case 'all':
            // Desde el inicio de los tiempos (año 2000)
            startDate = new Date('2000-01-01');
            break;
        
        default:
            throw new Error(`Período inválido: ${period}`);
    }

    return {
        startDate,
        endDate
    };
}

/**
 * Verifica si una fecha está entre dos fechas
 * @param {Date|string} date - Fecha a verificar
 * @param {Date|string} startDate - Fecha de inicio
 * @param {Date|string} endDate - Fecha de fin
 * @returns {boolean} true si está en el rango
 */
export function isDateInRange(date, startDate, endDate) {
    const checkDate = new Date(date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    return checkDate >= start && checkDate <= end;
}

/**
 * Agrupa earnings por mes
 * @param {Array<Object>} earnings - Array de earnings con campo earned_at
 * @returns {Object} Objeto con earnings agrupados por mes
 */
export function groupEarningsByMonth(earnings) {
    if (!Array.isArray(earnings)) {
        throw new Error('earnings debe ser un array');
    }

    const grouped = {};

    earnings.forEach(earning => {
        const date = new Date(earning.earned_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!grouped[monthKey]) {
            grouped[monthKey] = {
                month: monthKey,
                monthName: formatDate(date).split(' ').slice(0, 2).join(' '), // "enero 2024"
                earnings: [],
                total: 0,
                count: 0
            };
        }
        
        grouped[monthKey].earnings.push(earning);
        grouped[monthKey].total += earning.instructor_earning || 0;
        grouped[monthKey].count++;
    });

    // Convertir a array y ordenar por mes descendente
    return Object.values(grouped).sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Obtiene el primer día del mes actual
 * @returns {Date} Primer día del mes a las 00:00:00
 */
export function getFirstDayOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Obtiene el último día del mes actual
 * @returns {Date} Último día del mes a las 23:59:59
 */
export function getLastDayOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Calcula la diferencia en días entre dos fechas
 * @param {Date|string} date1 - Primera fecha
 * @param {Date|string} date2 - Segunda fecha
 * @returns {number} Diferencia en días (absoluta)
 */
export function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    const diffMs = Math.abs(d2 - d1);
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Verifica si una fecha es válida
 * @param {Date|string} date - Fecha a verificar
 * @returns {boolean} true si es válida
 */
export function isValidDate(date) {
    const d = new Date(date);
    return !isNaN(d.getTime());
}

/**
 * Convierte una fecha a formato ISO string (UTC)
 * @param {Date|string} date - Fecha a convertir
 * @returns {string} Fecha en formato ISO
 */
export function toISOString(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
        throw new Error('Fecha inválida');
    }
    return d.toISOString();
}

/**
 * Obtiene la fecha de inicio y fin de una semana
 * @param {Date|string} date - Fecha de referencia (opcional, default: hoy)
 * @returns {Object} Objeto con startOfWeek y endOfWeek
 */
export function getWeekRange(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    
    // Lunes (día 1) como inicio de semana
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    
    const startOfWeek = new Date(d);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return {
        startOfWeek,
        endOfWeek
    };
}

export default {
    addDays,
    isAvailable,
    calculateAvailableDate,
    daysUntilAvailable,
    formatDate,
    formatDateTime,
    getDateRange,
    isDateInRange,
    groupEarningsByMonth,
    getFirstDayOfMonth,
    getLastDayOfMonth,
    daysBetween,
    isValidDate,
    toISOString,
    getWeekRange
};
