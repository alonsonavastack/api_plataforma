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
        enum: ['wallet', 'transfer', 'paypal', 'card', 'mercadopago', 'other']
    },

    // Moneda
    currency_total: { type: String, default: 'USD' },
    currency_payment: { type: String, default: 'USD' },

    // Estado de la venta
    status: {
        type: String,
        default: 'Pendiente',
        enum: ['Pendiente', 'Pagado', 'Anulado']
    },

    // Total de la venta
    total: { type: Number, required: true },

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

    // ✅ NUEVO: Comprobante de pago (nombre del archivo)
    voucher_image: { type: String, default: null },

    // Tipo de cambio al momento de la compra
    price_dolar: { type: Number, default: 1 },

    // Número de transacción único
    n_transaccion: {
        type: String,
        maxlength: 200,
        required: true,
        unique: true
    },

    // === BILLETERA DIGITAL ===
    wallet_amount: { type: Number, default: 0 },
    remaining_amount: { type: Number, default: 0 },
    auto_verified: { type: Boolean, default: false },

    // === VERIFICACIÓN DE TRANSFERENCIAS ===
    transfer_receipt: {
        // Comprobante subido por el estudiante
        student_receipt: {
            url: { type: String, default: null },
            uploaded_at: { type: Date, default: null },
            file_name: { type: String, default: null }
        },
        // Verificación del admin
        admin_verification: {
            receipt_url: { type: String, default: null },
            receipt_file_name: { type: String, default: null },
            verified_by: { type: Schema.ObjectId, ref: 'user', default: null },
            verified_at: { type: Date, default: null },
            verification_notes: { type: String, default: null }
        }
    },

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
