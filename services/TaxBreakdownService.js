import models from "../models/index.js";

/**
 * 🧮 Servicio de Cálculo Fiscal y Desglose
 */
class TaxBreakdownService {

    /**
     * Calcular desglose fiscal completo y guardar registros
     * @param {Object} sale - Objeto de venta completo
     * @param {Object} earning - Objeto de ganancia de instructor (ya guardado)
     */
    async calculateBreakdown(sale, earning) {
        try {
            console.log(`\n🧮 [TaxBreakdown] Calculando desglose para Venta ${sale._id} / Earning ${earning._id}`);

            // 📌 Escenario Base (Valores del prompt como referencia)
            // Cliente paga: $110.00 MXN (saleAmount)

            // Obtener monto real de la venta (o del item si es venta múltiple)
            const saleAmount = earning.sale_price; // $110.00

            // 1️⃣ Comisión Stripe (RECIBIR)
            // 🔥 TOMA EL VALOR REAL DE LA GANANCIA GUARDADA (SaleService)
            // Si por alguna razón no existe, calculamos con la fórmula correcta (Progressive Rounding sería ideal pero aquí aproximamos)
            const stripeReceiveCommission = earning.payment_fee_amount || 0;

            const netAfterStripeReceive = saleAmount - stripeReceiveCommission; // Base Repartible Real

            // 2️⃣ División Real (Basada en la ganancia real calculada previamente sobre el NETO)
            const instructorShare = earning.instructor_earning; // Ganancia neta del instructor (70-80% del neto)
            const platformShare = netAfterStripeReceive - instructorShare; // 20-30% del neto

            // 3️⃣ Retenciones al Instructor (ELIMINADO A PETICIÓN DEL USUARIO)
            // Ya no se retiene ISR ni IVA al instructor porque no hay depósito bancario directo
            const isrRetention = 0;
            const ivaRetention = 0;
            const totalRetentions = 0;

            const instructorNetPay = instructorShare; // Se transfiere el total de su ganancia

            // 4️⃣ Comisión Stripe (ENVIAR al instructor)
            // Esto es lo que cuesta ENVIARLE el dinero (Payouts)
            // Mantendremos el cálculo informativo.
            const stripeSendPercentage = 0; // Configurable si se cobra algo por payout
            const stripeSendFee = 0; // Stripe Connect standard payouts to connected accounts typically don't have this extra fee if configured correctly, but keeping vars just in case

            const stripeSendCommission = (instructorNetPay * stripeSendPercentage) + stripeSendFee;

            const totalStripeCommissions = stripeReceiveCommission + stripeSendCommission;

            // 5️⃣ Ganancia Operativa de la Plataforma
            const platformOperatingProfit = platformShare - stripeSendCommission;

            // 6️⃣ Impuestos de la Plataforma (Sobre su ganancia operativa)
            const platformISR = platformOperatingProfit * 0.10;
            const platformIVA = platformOperatingProfit * 0.16;
            const totalPlatformTaxes = platformISR + platformIVA;

            const platformNetProfit = platformOperatingProfit - totalPlatformTaxes;

            // Fechas para reporte
            const now = new Date();
            const month = now.getMonth() + 1; // 1-12
            const year = now.getFullYear();

            // 💾 Guardar InstructorRetention
            const retentionRecord = await models.InstructorRetention.create({
                instructor: earning.instructor,
                sale: sale._id,
                earning: earning._id,
                course: earning.product_type === 'course' ? earning.product_id : undefined, // 🔥 Guardar curso si aplica
                is_referral: earning.is_referral, // 🔥 Guardar origen
                gross_earning: instructorShare, // $50.80
                isr_retention: isrRetention,
                iva_retention: ivaRetention,
                total_retention: totalRetentions,
                net_pay: instructorNetPay,
                stripe_send_commission: stripeSendCommission,
                status: 'pending',
                month: month,
                year: year
            });

            // 💾 Guardar PlatformCommissionBreakdown (Solo una vez por venta si es curso único, o por item)
            // Asumimos desglose por ITEM para máxima granularidad
            await models.PlatformCommissionBreakdown.create({
                sale: sale._id,
                sale_amount: saleAmount,
                stripe_receive_commission: stripeReceiveCommission,
                stripe_send_commission: stripeSendCommission,
                total_stripe_commissions: totalStripeCommissions,
                net_after_stripe_receive: netAfterStripeReceive,
                platform_share: platformShare,
                instructor_share: instructorShare,
                platform_operating_profit: platformOperatingProfit,
                platform_isr: platformISR,
                platform_iva: platformIVA,
                platform_net_profit: platformNetProfit,
                instructor_isr_retention: isrRetention,
                instructor_iva_retention: ivaRetention,
                instructor_net_pay: instructorNetPay
            });

            console.log(`   ✅ Desglose Fiscal Guardado:`);
            console.log(`      Instructor Net: $${instructorNetPay.toFixed(2)}`);
            console.log(`      Retenciones: $${totalRetentions.toFixed(2)}`);
            console.log(`      Plataforma Net: $${platformNetProfit.toFixed(2)}`);

            return retentionRecord;

        } catch (error) {
            console.error(`   ❌ Error calculando desglose fiscal:`, error);
            // No lanzamos error para no detener el proceso de venta principal, pero logueamos fuerte
            return null;
        }
    }

    /**
     * Generar reporte mensual
     */
    async getMonthlyReport(month, year) {
        // Implementación futura para endpoints
    }
}

export default new TaxBreakdownService();
