import mongoose from 'mongoose';

const { Schema } = mongoose;

// Modelo de Reembolso
const RefundSchema = new Schema({
    // Referencia a la venta original
    sale: { type: Schema.ObjectId, ref: 'sale', required: true },

    // 🆕 NUEVO: Ítem específico de la venta a reembolsar
    sale_detail_item: {
        product: { type: Schema.ObjectId, required: true, refPath: 'sale_detail_item.product_type' },
        product_type: { type: String, required: true, enum: ['course', 'project'] },
        title: { type: String },
        price_unit: { type: Number, required: true } // Precio del ítem específico
    },

    // Usuario que solicita el reembolso
    user: { type: Schema.ObjectId, ref: 'user', required: true },

    // Curso o Proyecto relacionado
    course: { type: Schema.ObjectId, ref: 'course' },
    project: { type: Schema.ObjectId, ref: 'project' },

    // Datos del pago original
    originalAmount: { type: Number, required: true }, // Monto original pagado
    currency: { type: String, default: 'USD' },

    // Cálculos fiscales y deducciones
    calculations: {
        // Desglose del monto original
        subtotal: { type: Number }, // Precio sin IVA
        iva: { type: Number }, // 16% IVA
        ivaRate: { type: Number, default: 0.16 }, // Tasa de IVA

        // Deducciones
        platformFee: { type: Number }, // Comisión plataforma (5%)
        platformFeeRate: { type: Number, default: 0.05 },

        processingFee: { type: Number }, // Comisión procesamiento bancario (3%)
        processingFeeRate: { type: Number, default: 0.03 },

        // Total a reembolsar
        refundAmount: { type: Number }, // Monto neto a devolver
        refundPercentage: { type: Number } // % del monto original
    },

    // Motivo del reembolso
    reason: {
        type: {
            type: String,
            enum: [
                'not_expected',      // 🆕 No era lo que esperaba
                'technical_issues',  // ✅ Problemas técnicos
                'quality',           // 🆕 Problemas de calidad
                'duplicate_purchase',// ✅ Compra duplicada
                'other',             // ✅ Otro motivo
                // Legacy (mantener compatibilidad):
                'course_not_started',
                'dissatisfied',
                'instructor_request'
            ],
            required: true
        },
        description: { type: String, required: true }
    },

    // Estado del reembolso
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'],
        default: 'pending'
    },

    // Información de la devolución
    refundDetails: {
        bankAccount: { type: String }, // CLABE interbancaria o número de cuenta
        bankName: { type: String },
        accountHolder: { type: String },

        // Comprobante de devolución
        receiptNumber: { type: String }, // Número de referencia de la transferencia
        receiptImage: { type: String }, // Comprobante escaneado
    },

    // Fechas importantes
    requestedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    processedAt: { type: Date },
    completedAt: { type: Date },

    // Notas administrativas
    adminNotes: { type: String },
    reviewedBy: { type: Schema.ObjectId, ref: 'user' }, // Admin que revisó

    // Comprobación fiscal
    taxInvoice: {
        cfdiGenerated: { type: Boolean, default: false }, // Si se generó CFDI de egreso
        cfdiUuid: { type: String },
        invoiceUrl: { type: String }
    },

    // Estado
    state: { type: Number, default: 1 } // 1=Activo, 2=Anulado
});

// Método para calcular el reembolso
RefundSchema.methods.calculateRefund = function () {
    // 🔥 USAR EL PRECIO DEL ÍTEM ESPECÍFICO, NO EL TOTAL DE LA VENTA
    const original = this.sale_detail_item?.price_unit || this.originalAmount;

    // Inicializar calculations si no existe
    if (!this.calculations) {
        this.calculations = {};
    }

    // 🆕 NUEVO SISTEMA: Reembolso completo a billetera digital
    // Ya NO hay deducciones - el estudiante recibe el 100%

    // 1. El monto a reembolsar es el 100% del pago original
    const refundAmount = original;
    const refundPercentage = 100;

    // 2. Solo guardamos datos para referencia histórica
    // (pero ya no se usan para cálculos)
    const ivaRate = 0.16;
    const subtotal = original / (1 + ivaRate);
    const iva = original - subtotal;

    // Comisiones ya NO se deducen del reembolso
    // Se quedan en la plataforma automáticamente
    const platformFeeRate = 0;
    const processingFeeRate = 0;
    const platformFee = 0;
    const processingFee = 0;

    // 3. Actualizar el documento
    this.calculations.subtotal = parseFloat(subtotal.toFixed(2));
    this.calculations.iva = parseFloat(iva.toFixed(2));
    this.calculations.ivaRate = ivaRate;
    this.calculations.platformFee = 0;
    this.calculations.platformFeeRate = 0;
    this.calculations.processingFee = 0;
    this.calculations.processingFeeRate = 0;
    this.calculations.refundAmount = parseFloat(refundAmount.toFixed(2)); // 👉 Siempre 100%
    this.calculations.refundPercentage = parseFloat(refundPercentage.toFixed(2)); // 👉 Siempre 100%

    console.log(`💰 [Refund] Calculado: ${original} → ${refundAmount} (${refundPercentage}%)`);

    return this.calculations;
};

// Índices para búsquedas rápidas
RefundSchema.index({ sale: 1 });
RefundSchema.index({ user: 1 });
RefundSchema.index({ status: 1 });
RefundSchema.index({ requestedAt: -1 });

export default mongoose.model('Refund', RefundSchema);
