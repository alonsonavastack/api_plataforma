import mongoose from 'mongoose';
const { Schema } = mongoose;

const InstructorRetentionSchema = new Schema({
    instructor: { type: Schema.Types.ObjectId, ref: 'user', required: true },
    sale: { type: Schema.Types.ObjectId, ref: 'sale', required: true },
    earning: { type: Schema.Types.ObjectId, ref: 'instructor_earnings', required: true },

    // Montos brutos
    gross_earning: { type: Number, required: true }, // $50.80

    // Retenciones
    isr_retention: { type: Number, required: true },  // 10% ISR
    iva_retention: { type: Number, required: true },  // 10.6% IVA
    total_retention: { type: Number, required: true }, // ISR + IVA

    // Monto neto a pagar
    net_pay: { type: Number, required: true }, // gross - retentions

    // Comisiones PayPal (enviar)
    paypal_send_commission: { type: Number, required: true }, // Comisión al enviar el pago

    // Estado de la retención
    status: {
        type: String,
        enum: ['pending', 'paid', 'declared'], // pending → paid → declared
        default: 'pending'
    },

    // Control fiscal
    month: { type: Number, required: true },  // Mes de declaración (1-12)
    year: { type: Number, required: true },   // Año fiscal

    // Comprobantes
    cfdi_uuid: { type: String, default: null },
    declaration_date: { type: Date, default: null },
    // Archivos CFDI
    cfdi_xml: { type: String, default: null }, // filename
    cfdi_pdf: { type: String, default: null }, // filename

    // Auditoría
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

const InstructorRetention = mongoose.model('InstructorRetention', InstructorRetentionSchema);
export default InstructorRetention;
