import models from "../models/index.js";

// 🔧 FIX BUG #67: Controlador de Notificaciones
export default {
    // Obtener notificaciones del usuario autenticado
    list: async(req, res) => {
        try {
            const userId = req.user._id;
            const { limit = 50, skip = 0, isRead } = req.query;

            const filter = {
                user: userId,
                isDeleted: false
            };

            // Filtrar por estado de lectura si se proporciona
            if (isRead !== undefined) {
                filter.isRead = isRead === 'true';
            }

            const notifications = await models.Notification.find(filter)
                .sort({ createdAt: -1 })
                .limit(parseInt(limit))
                .skip(parseInt(skip))
                .lean();

            const unreadCount = await models.Notification.getUnreadCount(userId);

            res.status(200).json({
                notifications,
                unreadCount,
                total: await models.Notification.countDocuments(filter)
            });
        } catch (error) {
            console.error('❌ Error al listar notificaciones:', error);
            res.status(500).send({
                message: 'HUBO UN ERROR AL CARGAR LAS NOTIFICACIONES'
            });
        }
    },

    // Marcar una notificación como leída
    markAsRead: async(req, res) => {
        try {
            const notificationId = req.params.id;
            const userId = req.user._id;

            // Verificar que la notificación pertenece al usuario
            const notification = await models.Notification.findOne({
                _id: notificationId,
                user: userId
            });

            if (!notification) {
                return res.status(404).json({
                    message: 'NOTIFICACIÓN NO ENCONTRADA'
                });
            }

            await models.Notification.markAsRead(notificationId);

            const unreadCount = await models.Notification.getUnreadCount(userId);

            res.status(200).json({
                message: 'NOTIFICACIÓN MARCADA COMO LEÍDA',
                unreadCount
            });
        } catch (error) {
            console.error('❌ Error al marcar notificación como leída:', error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },

    // Marcar todas las notificaciones como leídas
    markAllAsRead: async(req, res) => {
        try {
            const userId = req.user._id;

            const result = await models.Notification.markAllAsRead(userId);

            res.status(200).json({
                message: `${result.modifiedCount} NOTIFICACIONES MARCADAS COMO LEÍDAS`,
                modifiedCount: result.modifiedCount,
                unreadCount: 0
            });
        } catch (error) {
            console.error('❌ Error al marcar todas como leídas:', error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },

    // Eliminar una notificación (soft delete)
    remove: async(req, res) => {
        try {
            const notificationId = req.params.id;
            const userId = req.user._id;

            // Verificar que la notificación pertenece al usuario
            const notification = await models.Notification.findOne({
                _id: notificationId,
                user: userId
            });

            if (!notification) {
                return res.status(404).json({
                    message: 'NOTIFICACIÓN NO ENCONTRADA'
                });
            }

            await models.Notification.findByIdAndUpdate(notificationId, {
                isDeleted: true
            });

            res.status(200).json({
                message: 'NOTIFICACIÓN ELIMINADA'
            });
        } catch (error) {
            console.error('❌ Error al eliminar notificación:', error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },

    // Obtener contador de notificaciones no leídas
    getUnreadCount: async(req, res) => {
        try {
            const userId = req.user._id;
            const unreadCount = await models.Notification.getUnreadCount(userId);

            res.status(200).json({
                unreadCount
            });
        } catch (error) {
            console.error('❌ Error al obtener contador:', error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },

    // 🔥 NUEVO: Marcar notificación de review como leída cuando instructor responde
    markReviewNotificationAsRead: async(reviewId, instructorId) => {
        try {
            // Buscar notificación de tipo 'new_review' para este instructor y review
            const notification = await models.Notification.findOne({
                user: instructorId,
                type: 'new_review',
                'data.reviewId': reviewId,
                isRead: false,
                isDeleted: false
            });

            if (notification) {
                await models.Notification.markAsRead(notification._id);
                console.log('✅ Notificación de review auto-marcada como leída:', notification._id);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('❌ Error al auto-marcar notificación de review:', error);
            return false;
        }
    }
};
