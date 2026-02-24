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
RefundSchema.methods.calculateRefund = function (paymentMethod = null) {
    // 🔥 USAR EL PRECIO DEL ÍTEM ESPECÍFICO, NO EL TOTAL DE LA VENTA
    const original = this.sale_detail_item?.price_unit || this.originalAmount;

    if (!this.calculations) this.calculations = {};

    // ✅ POLÍTICA: Solo se descuenta el fee de Stripe si el pago fue con tarjeta.
    // Pagos con billetera (wallet) se reembolsan al 100% ya que no hubo procesamiento bancario.
    const method = paymentMethod || this._paymentMethod || 'stripe';
    const isWalletOnly = method === 'wallet';

    let stripeFee = 0;

    if (!isWalletOnly) {
        // Stripe México: 3.6% + $3.00 MXN fijo + 16% IVA sobre el fee
        const STRIPE_PERCENT = 0.036;
        const STRIPE_FIXED   = 3.00;
        const IVA_RATE       = 1.16;

        // Para pago mixto, el fee de Stripe aplica solo sobre el monto que pasó por Stripe
        // El resto (billetera) se reembolsa al 100%
        if (method === 'mixed_stripe') {
            const walletAmount  = this._walletAmount || 0;
            const stripeAmount  = Math.max(0, original - walletAmount);
            const rawFee = ((stripeAmount * STRIPE_PERCENT) + STRIPE_FIXED) * IVA_RATE;
            stripeFee = parseFloat(rawFee.toFixed(2));
        } else {
            // Pago 100% Stripe
            const rawFee = ((original * STRIPE_PERCENT) + STRIPE_FIXED) * IVA_RATE;
            stripeFee = parseFloat(rawFee.toFixed(2));
        }
    }

    const refundAmount     = parseFloat(Math.max(0, original - stripeFee).toFixed(2));
    const refundPercentage = parseFloat(((refundAmount / original) * 100).toFixed(2));

    this.calculations.subtotal          = original;
    this.calculations.iva               = 0;
    this.calculations.ivaRate           = 0;
    this.calculations.platformFee       = 0;
    this.calculations.platformFeeRate   = 0;
    this.calculations.processingFee     = stripeFee;
    this.calculations.processingFeeRate = isWalletOnly ? 0 : 0.036;
    this.calculations.refundAmount      = refundAmount;
    this.calculations.refundPercentage  = refundPercentage;
    this.calculations.payment_method    = method;

    console.log(`💰 [Refund] Método: ${method} | ${original} MXN - Fee Stripe: ${stripeFee} = Reembolso: ${refundAmount} MXN (${refundPercentage}%)`);

    return this.calculations;
};

// Índices para búsquedas rápidas
RefundSchema.index({ sale: 1 });
RefundSchema.index({ user: 1 });
RefundSchema.index({ status: 1 });
RefundSchema.index({ requestedAt: -1 });
// 🔥 INDEX OPTIMIZATION: Compound index for refund checks
RefundSchema.index({ user: 1, status: 1, 'sale_detail_item.product': 1 });

export default mongoose.model('Refund', RefundSchema);
