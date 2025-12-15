import { io } from '../../server.js';

/**
 * 📊 SISTEMA DE LOGS EN TIEMPO REAL
 * 
 * Este servicio captura y emite logs de eventos importantes del sistema:
 * - Inicios de sesión
 * - Navegación de páginas
 * - Compras realizadas
 * - Errores del sistema
 * - Acciones administrativas
 */

class LogService {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000; // Mantener máximo 1000 logs en memoria
    }

    /**
     * 🔐 LOG: Inicio de sesión
     */
    logLogin(user, ip, userAgent) {
        const log = {
            id: Date.now() + Math.random(),
            type: 'login',
            timestamp: new Date(),
            user: {
                _id: user._id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                rol: user.rol
            },
            ip: ip,
            userAgent: userAgent,
            message: `${user.name} ${user.surname} inició sesión`
        };

        this.addLog(log);
        this.emitToAdmins('new_log', log);
    }

    /**
     * 📍 LOG: Navegación de páginas
     */
    logPageVisit(user, page, ip) {
        const log = {
            id: Date.now() + Math.random(),
            type: 'page_visit',
            timestamp: new Date(),
            user: {
                _id: user._id,
                name: user.name,
                surname: user.surname,
                rol: user.rol
            },
            page: page,
            ip: ip,
            message: `${user.name} visitó ${page}`
        };

        this.addLog(log);
        this.emitToAdmins('new_log', log);
    }

    /**
     * 🛒 LOG: Compra realizada
     */
    logPurchase(user, sale, ip) {
        const log = {
            id: Date.now() + Math.random(),
            type: 'purchase',
            timestamp: new Date(),
            user: {
                _id: user._id,
                name: user.name,
                surname: user.surname,
                email: user.email
            },
            sale: {
                _id: sale._id,
                n_transaccion: sale.n_transaccion,
                total: sale.total,
                method_payment: sale.method_payment,
                status: sale.status
            },
            ip: ip,
            message: `${user.name} realizó una compra de $${sale.total}`
        };

        this.addLog(log);
        this.emitToAdmins('new_log', log);
    }

    /**
     * ❌ LOG: Error del sistema
     */
    logError(error, user = null, context = '') {
        const log = {
            id: Date.now() + Math.random(),
            type: 'error',
            timestamp: new Date(),
            user: user ? {
                _id: user._id,
                name: user.name,
                surname: user.surname
            } : null,
            error: {
                message: error.message,
                stack: error.stack,
                context: context
            },
            message: `Error: ${error.message}`
        };

        this.addLog(log);
        this.emitToAdmins('new_log', log);
    }

    /**
     * ⚙️ LOG: Acción administrativa
     */
    logAdminAction(admin, action, target, details = {}) {
        const log = {
            id: Date.now() + Math.random(),
            type: 'admin_action',
            timestamp: new Date(),
            admin: {
                _id: admin._id,
                name: admin.name,
                surname: admin.surname,
                email: admin.email
            },
            action: action,
            target: target,
            details: details,
            message: `${admin.name} ${action} ${target}`
        };

        this.addLog(log);
        this.emitToAdmins('new_log', log);
    }

    /**
     * 📝 LOG: Registro de usuario
     */
    logUserRegistration(user, ip) {
        const log = {
            id: Date.now() + Math.random(),
            type: 'registration',
            timestamp: new Date(),
            user: {
                _id: user._id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                rol: user.rol
            },
            ip: ip,
            message: `Nuevo usuario registrado: ${user.name} ${user.surname}`
        };

        this.addLog(log);
        this.emitToAdmins('new_log', log);
    }

    /**
     * 💳 LOG: Reembolso procesado
     */
    logRefund(admin, refund, user) {
        const log = {
            id: Date.now() + Math.random(),
            type: 'refund',
            timestamp: new Date(),
            admin: {
                _id: admin._id,
                name: admin.name,
                surname: admin.surname
            },
            user: {
                _id: user._id,
                name: user.name,
                surname: user.surname
            },
            refund: {
                _id: refund._id,
                amount: refund.amount,
                status: refund.status
            },
            message: `${admin.name} procesó reembolso para ${user.name}`
        };

        this.addLog(log);
        this.emitToAdmins('new_log', log);
    }

    /**
     * 📚 LOG: Curso/Proyecto creado
     */
    logContentCreation(instructor, contentType, content) {
        const log = {
            id: Date.now() + Math.random(),
            type: 'content_creation',
            timestamp: new Date(),
            instructor: {
                _id: instructor._id,
                name: instructor.name,
                surname: instructor.surname
            },
            contentType: contentType,
            content: {
                _id: content._id,
                title: content.title
            },
            message: `${instructor.name} creó ${contentType}: ${content.title}`
        };

        this.addLog(log);
        this.emitToAdmins('new_log', log);
    }

    /**
     * Agregar log a la lista en memoria
     */
    addLog(log) {
        this.logs.unshift(log);
        
        // Mantener solo los últimos N logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        console.log(`📊 [LOG] ${log.type}: ${log.message}`);
    }

    /**
     * Emitir evento solo a usuarios administradores
     */
    emitToAdmins(event, data) {
        if (!io) return;

        // Socket.io: emitir solo a sala de admins
        io.to('admins').emit(event, data);
    }

    /**
     * Obtener logs filtrados
     */
    getLogs(filters = {}) {
        let filteredLogs = [...this.logs];

        // Filtrar por tipo
        if (filters.type && filters.type !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.type === filters.type);
        }

        // Filtrar por rango de fechas
        if (filters.startDate) {
            filteredLogs = filteredLogs.filter(log => 
                new Date(log.timestamp) >= new Date(filters.startDate)
            );
        }

        if (filters.endDate) {
            filteredLogs = filteredLogs.filter(log => 
                new Date(log.timestamp) <= new Date(filters.endDate)
            );
        }

        // Filtrar por usuario
        if (filters.userId) {
            filteredLogs = filteredLogs.filter(log => 
                log.user?._id === filters.userId
            );
        }

        // Limitar cantidad
        const limit = filters.limit || 100;
        return filteredLogs.slice(0, limit);
    }

    /**
     * Limpiar logs antiguos
     */
    clearOldLogs(days = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        this.logs = this.logs.filter(log => 
            new Date(log.timestamp) > cutoffDate
        );

        console.log(`🧹 [LOG] Logs antiguos limpiados. Restantes: ${this.logs.length}`);
    }

    /**
     * Obtener estadísticas de logs
     */
    getStats() {
        const stats = {
            total: this.logs.length,
            byType: {},
            last24h: 0,
            lastHour: 0
        };

        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

        this.logs.forEach(log => {
            // Contar por tipo
            stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;

            // Contar últimas 24 horas
            if (new Date(log.timestamp) > last24h) {
                stats.last24h++;
            }

            // Contar última hora
            if (new Date(log.timestamp) > lastHour) {
                stats.lastHour++;
            }
        });

        return stats;
    }
}

// Exportar instancia única
export const logService = new LogService();

// Limpiar logs antiguos cada día
setInterval(() => {
    logService.clearOldLogs(7);
}, 24 * 60 * 60 * 1000);

export default logService;
