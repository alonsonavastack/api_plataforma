import mongoose, { Schema } from "mongoose";

const InstructorPaymentConfigSchema = new Schema({
    instructor: {
        type: Schema.ObjectId,
        ref: 'user',
        required: true,
        unique: true // Un instructor solo puede tener una configuración
    },

    // CONFIGURACIÓN DE STRIPE CONNECT
    stripe_account_id: {
        type: String,
        default: null
    },
    stripe_onboarding_complete: {
        type: Boolean,
        default: false
    },
    stripe_charges_enabled: {
        type: Boolean,
        default: false
    },
    stripe_payouts_enabled: {
        type: Boolean,
        default: false
    },


    // CONFIGURACIÓN GENERAL
    preferred_payment_method: {
        type: String,
        enum: ['stripe', 'wallet', ''],
        default: ''
    },

    // ESTADO
    state: {
        type: Boolean,
        default: true // true = activo, false = inactivo
    }
}, {
    timestamps: true
});

// Índice para búsquedas rápidas por instructor
InstructorPaymentConfigSchema.index({ instructor: 1 });

const InstructorPaymentConfig = mongoose.model("instructor_payment_config", InstructorPaymentConfigSchema);
export default InstructorPaymentConfig;
