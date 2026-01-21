import mongoose, { Schema } from "mongoose";

const CouponSchema = new Schema({
    code: {
        type: String,
        maxLength: 50,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    instructor: {
        type: Schema.ObjectId,
        ref: 'user',
        required: true
    },
    // El proyecto/curso para el cual es válido este cupón
    // Aunque el usuario dijo "seleccionar el proyecto", hacerlo array da flexibilidad futura
    // Si array está vacío, podría ser global para todos sus cursos (opcional)
    projects: [{
        type: Schema.ObjectId,
        ref: 'project', // O 'course', habrá que manejar ambos IDs o asumir que 'project' abarca ambos en contexto de selección
        required: true
    }],
    discount_percentage: {
        type: Number,
        default: 0, // Por defecto 0 si solo es para tracking/comisión
        min: 0,
        max: 100
    },
    expires_at: {
        type: Date,
        required: true
    },
    active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Índice para buscar rápido por código
CouponSchema.index({ code: 1 });
CouponSchema.index({ instructor: 1 });

const Coupon = mongoose.model("coupon", CouponSchema);
export default Coupon;
