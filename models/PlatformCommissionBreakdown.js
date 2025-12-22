import mongoose from 'mongoose';
const { Schema } = mongoose;

const PlatformCommissionBreakdownSchema = new Schema({
    sale: { type: Schema.Types.ObjectId, ref: 'sale', required: true },

    // Ingreso inicial
    sale_amount: { type: Number, required: true }, // Total venta

    // Comisiones PayPal
    paypal_receive_commission: { type: Number, required: true }, // 4% + 4 fijo (al recibir)
    paypal_send_commission: { type: Number, required: true },    // 4% + 4 fijo (al enviar)
    total_paypal_commissions: { type: Number, required: true },  // Suma de ambas

    // División instructor/plataforma
    net_after_paypal_receive: { type: Number, required: true }, // Venta - comisión recibir
    platform_share: { type: Number, required: true },           // 50%
    instructor_share: { type: Number, required: true },         // 50%

    // Ganancia plataforma
    platform_operating_profit: { type: Number, required: true }, // Share - gastos paypal
    platform_isr: { type: Number, required: true },              // 10% s/ utilidad operativa
    platform_iva: { type: Number, required: true },              // 16% s/ utilidad operativa
    platform_net_profit: { type: Number, required: true },       // Final neto

    // Pago instructor (copia informativa del otro modelo)
    instructor_isr_retention: { type: Number, required: true },
    instructor_iva_retention: { type: Number, required: true },
    instructor_net_pay: { type: Number, required: true },

    // Auditoría
    created_at: { type: Date, default: Date.now }
});

const PlatformCommissionBreakdown = mongoose.model('PlatformCommissionBreakdown', PlatformCommissionBreakdownSchema);
export default PlatformCommissionBreakdown;
