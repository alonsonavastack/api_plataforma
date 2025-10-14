import mongoose, { Schema } from "mongoose";

const InstructorPaymentConfigSchema = new Schema({
    instructor: {
        type: Schema.ObjectId,
        ref: 'user',
        required: true,
        unique: true // Un instructor solo puede tener una configuración
    },
    
    // CONFIGURACIÓN DE PAYPAL
    paypal_email: {
        type: String,
        maxlength: 250,
        required: false
    },
    paypal_merchant_id: {
        type: String,
        maxlength: 250,
        required: false
    },
    paypal_connected: {
        type: Boolean,
        default: false
    },
    paypal_verified: {
        type: Boolean,
        default: false
    },
    
    // CONFIGURACIÓN DE CUENTA BANCARIA
    bank_account: {
        account_holder_name: {
            type: String,
            maxlength: 250,
            required: false
        },
        bank_name: {
            type: String,
            maxlength: 250,
            required: false
        },
        account_number: {
            type: String, // Este campo estará ENCRIPTADO
            required: false
        },
        clabe: {
            type: String, // CLABE interbancaria (México) - ENCRIPTADO
            maxlength: 18,
            required: false
        },
        swift_code: {
            type: String, // Para transferencias internacionales
            maxlength: 50,
            required: false
        },
        account_type: {
            type: String,
            enum: ['ahorros', 'corriente', ''],
            default: ''
        },
        verified: {
            type: Boolean,
            default: false
        }
    },
    
    // CONFIGURACIÓN GENERAL
    preferred_payment_method: {
        type: String,
        enum: ['paypal', 'bank_transfer', ''],
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
