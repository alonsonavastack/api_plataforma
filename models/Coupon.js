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
    // IDs de productos (cursos O proyectos) a los que aplica este cupón
    projects: [{
        type: Schema.ObjectId,
        required: true
    }],
    // 🔥 NUEVO: tipo de producto del cupón (para saber si aplica a course o project)
    product_type: {
        type: String,
        enum: ['course', 'project'],
        default: 'project'
    },
    discount_percentage: {
        type: Number,
        default: 0, // 0 = solo tracking de referido (comisión 80/20)
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
