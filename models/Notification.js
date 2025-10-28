import mongoose, {Schema} from "mongoose";

// 🔧 FIX BUG #67: Modelo de Notificaciones con estado de lectura
const NotificationSchema = new Schema({
    user: {type: Schema.ObjectId, ref: 'user', required: true}, // Usuario que recibe la notificación
    type: {
        type: String, 
        required: true, 
        enum: [
            'new_sale',           // Nueva venta realizada
            'sale_status_update', // Cambio de estado de venta
            'new_review',         // Nueva reseña en curso del instructor
            'new_student',        // Nuevo estudiante inscrito
            'course_published',   // Curso publicado (admin → instructor)
            'course_rejected',    // Curso rechazado (admin → instructor)
            'payment_processed',  // Pago procesado (admin → instructor)
            'system'              // Notificación del sistema
        ]
    },
    title: {type: String, required: true, maxlength: 250},
    message: {type: String, required: true},
    data: {type: Schema.Types.Mixed}, // Datos adicionales (sale, course, etc.)
    isRead: {type: Boolean, default: false}, // 🔧 Estado de lectura
    isDeleted: {type: Boolean, default: false}, // Soft delete
    icon: {type: String, default: 'bell'}, // Icono para el frontend (lucide-react)
    actionUrl: {type: String}, // URL opcional para redirigir al hacer click
}, {
    timestamps: true
});

// Índices para mejorar performance
NotificationSchema.index({ user: 1, isRead: 1, isDeleted: 1 });
NotificationSchema.index({ createdAt: -1 });

// Métodos estáticos útiles
NotificationSchema.statics.createNotification = async function(userId, type, title, message, data = {}, actionUrl = null) {
    const notification = await this.create({
        user: userId,
        type,
        title,
        message,
        data,
        actionUrl
    });
    
    console.log('🔔 Notificación creada:', notification._id, '-', title);
    return notification;
};

NotificationSchema.statics.markAsRead = async function(notificationId) {
    const notification = await this.findByIdAndUpdate(
        notificationId,
        { isRead: true },
        { new: true }
    );
    
    console.log('✅ Notificación marcada como leída:', notificationId);
    return notification;
};

NotificationSchema.statics.markAllAsRead = async function(userId) {
    const result = await this.updateMany(
        { user: userId, isRead: false, isDeleted: false },
        { isRead: true }
    );
    
    console.log(`✅ ${result.modifiedCount} notificaciones marcadas como leídas para usuario ${userId}`);
    return result;
};

NotificationSchema.statics.getUnreadCount = async function(userId) {
    return await this.countDocuments({ 
        user: userId, 
        isRead: false, 
        isDeleted: false 
    });
};

const Notification = mongoose.model("notification", NotificationSchema);

// Crear índices al iniciar
Notification.createIndexes().then(() => {
    console.log('✅ Notification indexes created');
}).catch(err => {
    console.error('❌ Error creating Notification indexes:', err);
});

export default Notification;
