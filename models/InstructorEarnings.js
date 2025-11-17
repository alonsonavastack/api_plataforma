import mongoose, { Schema } from "mongoose";

const InstructorEarningsSchema = new Schema({
    instructor: {
        type: Schema.ObjectId,
        ref: 'user',
        required: true
    },
    sale: {
        type: Schema.ObjectId,
        ref: 'sale',
        required: true
    },
    
    // Para cursos (legacy y nuevo)
    course: {
        type: Schema.ObjectId,
        ref: 'course',
        required: false
    },
    
    // Para proyectos y futuras referencias dinámicas
    product_id: {
        type: Schema.ObjectId,
        refPath: 'product_type',
        required: false
    },
    product_type: {
        type: String,
        enum: ['course', 'project'],
        required: false
    },
    
    // MONTOS DE LA VENTA (CON IVA INCLUIDO)
    sale_price: {
        type: Number,
        required: true
    },
    sale_price_includes_vat: {
        type: Boolean,
        default: true
    },
    currency: {
        type: String,
        default: 'USD',
        enum: ['USD', 'MXN', 'EUR', 'ARS']
    },
    
    // COMISIONES
    platform_commission_rate: {
        type: Number,
        required: true
    },
    platform_commission_amount: {
        type: Number,
        required: true
    },
    
    // DESGLOSE FISCAL
    fiscal: {
        country: { type: String, maxlength: 2, uppercase: true },
        tax_regime: { type: String, maxlength: 50 },
        tax_regime_name: { type: String, maxlength: 200 },
        tax_currency: { type: String, default: 'USD', enum: ['USD', 'MXN', 'EUR', 'ARS'] },
        
        subtotal_sin_iva: { type: Number, default: 0 },
        iva_amount: { type: Number, default: 0 },
        iva_rate: { type: Number, default: 0 },
        retencion_iva: { type: Number, default: 0 },
        retencion_iva_rate: { type: Number, default: 0 },
        isr_amount: { type: Number, default: 0 },
        isr_rate: { type: Number, default: 0 },
        
        retencion_irpf: { type: Number, default: 0 },
        other_taxes: { type: Number, default: 0 },
        total_taxes: { type: Number, default: 0 },
        
        ingreso_acumulado_antes: { type: Number, default: 0 },
        ingreso_acumulado_despues: { type: Number, default: 0 }
    },
    
    // MÉTODO DE PAGO
    payment_method: {
        type: String,
        enum: ['bank_transfer', 'paypal', 'stripe', 'wise', 'payoneer', 'oxxo', 'sepa'],
        required: false
    },
    payment_method_name: { type: String, maxlength: 100 },
    payment_currency: { type: String, default: 'USD', enum: ['USD', 'MXN', 'EUR', 'ARS'] },
    payment_fee_rate: { type: Number, default: 0 },
    payment_fee_amount: { type: Number, default: 0 },
    
    // TIPOS DE CAMBIO
    exchange_rates: {
        usd_to_tax_currency: { type: Number, default: 1 },
        tax_currency_to_payment_currency: { type: Number, default: 1 },
        timestamp: { type: Date }
    },
    
    // GANANCIA FINAL
    instructor_earning: { type: Number, required: true },
    instructor_earning_usd: { type: Number, default: 0 },
    
    // ESTADO
    status: {
        type: String,
        enum: ['pending', 'available', 'paid', 'disputed', 'blocked', 'refunded'],
        default: 'pending'
    },
    
    // 🆕 REFERENCIA AL REEMBOLSO (si existe)
    refund_reference: {
        type: Schema.ObjectId,
        ref: 'Refund',
        required: false
    },
    
    // 🆕 FECHA DEL REEMBOLSO
    refunded_at: {
        type: Date,
        required: false
    },
    
    // FECHAS
    earned_at: { type: Date, required: true, default: Date.now },
    available_at: { type: Date, required: true },
    paid_at: { type: Date, required: false },
    
    // REFERENCIA Y NOTAS
    payment_reference: { type: Schema.ObjectId, ref: 'instructor_payment', required: false },
    admin_notes: { type: String, maxlength: 1000, required: false },
    
    // ALERTAS FISCALES
    fiscal_alerts: [{
        level: { type: String, enum: ['info', 'warning', 'danger', 'blocked'] },
        message: { type: String, maxlength: 500 },
        percentage: { type: Number },
        created_at: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

// Índices
InstructorEarningsSchema.index({ instructor: 1, status: 1 });
InstructorEarningsSchema.index({ sale: 1 });
InstructorEarningsSchema.index({ available_at: 1, status: 1 });
InstructorEarningsSchema.index({ earned_at: -1 });

// Virtuales
InstructorEarningsSchema.virtual('is_available').get(function() {
    return this.status === 'available' || (this.status === 'pending' && new Date() >= this.available_at);
});

const InstructorEarnings = mongoose.model("instructor_earnings", InstructorEarningsSchema);
export default InstructorEarnings;
