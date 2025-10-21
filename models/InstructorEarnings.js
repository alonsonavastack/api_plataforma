import mongoose, { Schema } from "mongoose";

const InstructorEarningsSchema = new Schema({
    instructor: {
        type: Schema.ObjectId,
        ref: 'user',
        required: true
    },
    sale: {
        type: Schema.ObjectId,
        ref: 'sale',
        required: true
    },
    
    // Para cursos (legacy y nuevo)
    course: {
        type: Schema.ObjectId,
        ref: 'course',
        required: false
    },
    
    // Para proyectos y futuras referencias dinámicas
    product_id: {
        type: Schema.ObjectId,
        refPath: 'product_type',
        required: false
    },
    product_type: {
        type: String,
        enum: ['course', 'project'],
        required: false
    },
    
    // MONTOS DE LA VENTA
    sale_price: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD',
        enum: ['USD', 'MXN']
    },
    
    // COMISIONES (DECIDIDAS POR EL ADMIN)
    platform_commission_rate: {
        type: Number, // Porcentaje (ej: 30 = 30%)
        required: true
    },
    platform_commission_amount: {
        type: Number, // Monto en $ que se queda la plataforma
        required: true
    },
    instructor_earning: {
        type: Number, // Lo que le corresponde al instructor
        required: true
    },
    
    // ESTADO DE PAGO
    status: {
        type: String,
        enum: ['pending', 'available', 'paid', 'disputed'],
        default: 'pending'
        // pending: Recién creado, esperando días de seguridad
        // available: Ya puede ser pagado por el admin
        // paid: Ya fue pagado al instructor
        // disputed: Hay un problema/disputa
    },
    
    // FECHAS
    earned_at: {
        type: Date,
        required: true,
        default: Date.now
    },
    available_at: {
        type: Date,
        required: true
        // Se calcula: earned_at + X días (configurado en PlatformCommissionSettings)
    },
    paid_at: {
        type: Date,
        required: false
    },
    
    // REFERENCIA DE PAGO
    payment_reference: {
        type: Schema.ObjectId,
        ref: 'instructor_payment',
        required: false
    },
    
    // NOTAS DEL ADMIN
    admin_notes: {
        type: String,
        maxlength: 1000,
        required: false
    }
}, {
    timestamps: true
});

// Índices para optimizar búsquedas
InstructorEarningsSchema.index({ instructor: 1, status: 1 });
InstructorEarningsSchema.index({ sale: 1 });
InstructorEarningsSchema.index({ available_at: 1, status: 1 });
InstructorEarningsSchema.index({ earned_at: -1 }); // Para ordenar por fecha descendente

// Método virtual para saber si ya está disponible
InstructorEarningsSchema.virtual('is_available').get(function() {
    return this.status === 'available' || (this.status === 'pending' && new Date() >= this.available_at);
});

const InstructorEarnings = mongoose.model("instructor_earnings", InstructorEarningsSchema);
export default InstructorEarnings;
