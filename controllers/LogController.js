import { logService } from '../services/logs/LogService.js';

export default {
    /**
     * 📊 OBTENER LOGS
     * GET /api/logs/list
     * Query params: type, startDate, endDate, userId, limit
     */
    list: async (req, res) => {
        try {
            // Solo administradores
            if (req.user.rol !== 'admin') {
                return res.status(403).json({ 
                    message: 'No autorizado. Solo administradores.' 
                });
            }

            const filters = {
                type: req.query.type,
                startDate: req.query.startDate,
                endDate: req.query.endDate,
                userId: req.query.userId,
                limit: parseInt(req.query.limit) || 100
            };

            const logs = logService.getLogs(filters);

            res.status(200).json({
                success: true,
                logs: logs,
                total: logs.length
            });

        } catch (error) {
            console.error('❌ Error al obtener logs:', error);
            res.status(500).json({ 
                message: 'Error al obtener logs',
                error: error.message 
            });
        }
    },

    /**
     * 📈 OBTENER ESTADÍSTICAS DE LOGS
     * GET /api/logs/stats
     */
    stats: async (req, res) => {
        try {
            // Solo administradores
            if (req.user.rol !== 'admin') {
                return res.status(403).json({ 
                    message: 'No autorizado. Solo administradores.' 
                });
            }

            const stats = logService.getStats();

            res.status(200).json({
                success: true,
                stats: stats
            });

        } catch (error) {
            console.error('❌ Error al obtener stats:', error);
            res.status(500).json({ 
                message: 'Error al obtener estadísticas',
                error: error.message 
            });
        }
    },

    /**
     * 🗑️ LIMPIAR LOGS ANTIGUOS
     * POST /api/logs/clear
     * Body: { days }
     */
    clear: async (req, res) => {
        try {
            // Solo administradores
            if (req.user.rol !== 'admin') {
                return res.status(403).json({ 
                    message: 'No autorizado. Solo administradores.' 
                });
            }

            const days = req.body.days || 7;
            logService.clearOldLogs(days);

            res.status(200).json({
                success: true,
                message: `Logs antiguos de más de ${days} días eliminados`
            });

        } catch (error) {
            console.error('❌ Error al limpiar logs:', error);
            res.status(500).json({ 
                message: 'Error al limpiar logs',
                error: error.message 
            });
        }
    },

    /**
     * 📍 REGISTRAR VISITA DE PÁGINA (llamado desde frontend)
     * POST /api/logs/page-visit
     * Body: { page }
     */
    logPageVisit: async (req, res) => {
        try {
            const { page } = req.body;
            const user = req.user;
            const ip = req.ip || req.connection.remoteAddress;

            logService.logPageVisit(user, page, ip);

            res.status(200).json({
                success: true,
                message: 'Visita registrada'
            });

        } catch (error) {
            console.error('❌ Error al registrar visita:', error);
            res.status(500).json({ 
                message: 'Error al registrar visita',
                error: error.message 
            });
        }
    }
};
