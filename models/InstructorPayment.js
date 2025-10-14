import mongoose, { Schema } from "mongoose";

const InstructorPaymentSchema = new Schema({
    instructor: {
        type: Schema.ObjectId,
        ref: 'user',
        required: true
    },
    
    // MONTOS
    total_earnings: {
        type: Number, // Total de ganancias que se van a pagar
        required: true
    },
    amount_to_pay: {
        type: Number, // Monto que el admin decide pagar (puede ser diferente)
        required: true
    },
    platform_deductions: {
        type: Number, // Deducciones adicionales si hay (multas, comisiones extra, etc.)
        default: 0
    },
    final_amount: {
        type: Number, // Monto final que se envía al instructor
        required: true
    },
    currency: {
        type: String,
        default: 'USD',
        enum: ['USD', 'MXN']
    },
    
    // MÉTODO DE PAGO
    payment_method: {
        type: String,
        enum: ['paypal', 'bank_transfer', 'other'],
        required: true
    },
    payment_details: {
        // Para PayPal
        paypal_email: {
            type: String,
            required: false
        },
        paypal_transaction_id: {
            type: String,
            required: false
        },
        
        // Para Transferencia Bancaria
        bank_account_number: {
            type: String, // Solo últimos 4 dígitos por seguridad
            required: false
        },
        bank_name: {
            type: String,
            required: false
        },
        transfer_reference: {
            type: String, // Número de referencia de la transferencia
            required: false
        },
        transfer_receipt: {
            type: String, // URL del comprobante de transferencia
            required: false
        },
        
        // Para otros métodos
        other_details: {
            type: String,
            required: false
        }
    },
    
    // GANANCIAS INCLUIDAS EN ESTE PAGO
    earnings_included: [{
        type: Schema.ObjectId,
        ref: 'instructor_earnings'
    }],
    
    // ESTADO
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'pending'
        // pending: Creado pero aún no procesado
        // processing: En proceso de pago
        // completed: Pago exitoso
        // failed: Falló el pago
        // cancelled: Cancelado por admin
    },
    
    // FECHAS
    requested_at: {
        type: Date, // Si el instructor lo solicitó (opcional)
        required: false
    },
    created_by_admin_at: {
        type: Date,
        default: Date.now
    },
    processed_at: {
        type: Date, // Cuando se empezó a procesar
        required: false
    },
    completed_at: {
        type: Date, // Cuando se completó el pago
        required: false
    },
    
    // CONTROL DEL ADMIN
    created_by: {
        type: Schema.ObjectId,
        ref: 'user', // Admin que creó el pago
        required: true
    },
    processed_by: {
        type: Schema.ObjectId,
        ref: 'user', // Admin que procesó el pago
        required: false
    },
    
    // NOTAS
    admin_notes: {
        type: String,
        maxlength: 2000,
        required: false
    },
    instructor_notes: {
        type: String,
        maxlength: 1000,
        required: false
    },
    
    // HISTORIAL DE CAMBIOS DE ESTADO
    status_history: [{
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed', 'cancelled']
        },
        changed_at: {
            type: Date,
            default: Date.now
        },
        changed_by: {
            type: Schema.ObjectId,
            ref: 'user'
        },
        notes: {
            type: String
        }
    }]
}, {
    timestamps: true
});

// Índices
InstructorPaymentSchema.index({ instructor: 1, status: 1 });
InstructorPaymentSchema.index({ created_by_admin_at: -1 });
InstructorPaymentSchema.index({ status: 1 });

// Hook PRE-SAVE para agregar al historial de estado
InstructorPaymentSchema.pre('save', function(next) {
    if (this.isModified('status')) {
        this.status_history.push({
            status: this.status,
            changed_at: new Date(),
            changed_by: this.processed_by || this.created_by,
            notes: `Status changed to ${this.status}`
        });
    }
    next();
});

const InstructorPayment = mongoose.model("instructor_payment", InstructorPaymentSchema);
export default InstructorPayment;
