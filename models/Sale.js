import mongoose, { Schema } from "mongoose";

/**
 * 🛍️ MODELO DE VENTA - Sistema de Compra Directa
 * 
 * Cada venta representa la compra de UN producto (curso o proyecto).
 * El flujo es: Producto → Checkout → Venta
 * 
 * Estados:
 * - 'Pendiente': Esperando pago (transferencia)
 * - 'Pagado': Pago confirmado, contenido disponible
 * - 'Anulado': Venta cancelada
 */
const SaleSchema = new Schema({
    // Usuario que realiza la compra
    user: {
        type: Schema.ObjectId,
        ref: 'user',
        required: true
    },

    // Método de pago
    method_payment: {
        type: String,
        maxlength: 200,
        required: true,
        enum: ['wallet', 'stripe', 'mixed_stripe', 'transfer', 'card', 'other']
    },

    // === CUPONES Y REFERIDOS ===
    coupon_code: {
        type: String,
        maxlength: 50,
        trim: true,
        default: null
    },
    coupon_id: {
        type: Schema.ObjectId,
        ref: 'coupon',
        default: null
    },
    is_referral: {
        type: Boolean,
        default: false
    },

    // Moneda
    currency_total: { type: String, default: 'MXN' },
    currency_payment: { type: String, default: 'MXN' },

    // Estado de la venta
    status: {
        type: String,
        default: 'Pendiente',
        enum: ['Pendiente', 'Pagado', 'Anulado', 'En Revisión']
    },

    // Total de la venta
    total: { type: Number, required: true },

    // 🔥 CONVERSIÓN DE MONEDA (USD → MXN)
    // conversion_rate removed
    // total_mxn removed

    // Detalle del producto (siempre 1 en compra directa)
    detail: [{
        product: {
            type: Schema.ObjectId,
            required: true,
            refPath: 'detail.product_type'
        },
        product_type: {
            type: String,
            required: true,
            enum: ['course', 'project']
        },
        title: { type: String },
        price_unit: { type: Number },
        discount: { type: Number, default: 0 },
        type_discount: { type: Number, default: 0 },
        campaign_discount: { type: Number, default: null } // 1: campaña normal, 2: flash sale, etc.
    }],



    // Tipo de cambio al momento de la compra
    // price_dolar removed

    // Número de transacción único
    n_transaccion: {
        type: String,
        maxlength: 200,
        required: true,
        unique: true
    },

    // ID de la sesión de Stripe (para auto-verificación)
    stripe_session_id: {
        type: String,
        maxlength: 200,
        default: null
    },

    // ID del PaymentIntent de Stripe (confirmación final)
    stripe_payment_intent: {
        type: String,
        maxlength: 200,
        default: null
    },

    // === BILLETERA DIGITAL ===
    wallet_amount: { type: Number, default: 0 },
    remaining_amount: { type: Number, default: 0 },
    auto_verified: { type: Boolean, default: false },

    // === CONVERSIÓN DE MONEDA MULTI-PAÍS ===
    // Multi-country conversion fields removed



    // === NOTAS ADMINISTRATIVAS ===
    admin_notes: {
        type: String,
        maxlength: 1000,
        default: null
    },

    // === DATOS DE PRUEBA ===
    isTest: {
        type: Boolean,
        default: false,
        index: true
    },
    testReason: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Índices para búsquedas frecuentes
SaleSchema.index({ user: 1, status: 1 });
SaleSchema.index({ n_transaccion: 1 });
SaleSchema.index({ createdAt: -1 });
SaleSchema.index({ 'detail.product': 1 });

const Sale = mongoose.model("sale", SaleSchema);
export default Sale;
