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

            // 1️⃣ Comisión PayPal (RECIBIR)
            const paypalReceivePercentage = 0.04;  // 4%
            const paypalReceiveFee = 4.00;         // $4.00 MXN fijo

            const paypalReceiveCommission = (saleAmount * paypalReceivePercentage) + paypalReceiveFee;
            // $110.00 * 0.04 = 4.40 + 4.00 = 8.40

            const netAfterPaypalReceive = saleAmount - paypalReceiveCommission;
            // $110.00 - 8.40 = 101.60

            // 2️⃣ División 50/50
            const platformShare = netAfterPaypalReceive * 0.50;  // $50.80
            const instructorShare = netAfterPaypalReceive * 0.50; // $50.80

            // 3️⃣ Retenciones al Instructor
            const isrRetention = instructorShare * 0.10;    // 10% ISR = $5.08
            const ivaRetention = instructorShare * 0.106;   // 10.6% IVA = $5.38
            const totalRetentions = isrRetention + ivaRetention; // $10.46

            const instructorNetPay = instructorShare - totalRetentions; // $40.34

            // 4️⃣ Comisión PayPal (ENVIAR al instructor)
            const paypalSendPercentage = 0.04; // Se asume estándar para envíos masivos o transferencias
            const paypalSendFee = 4.00; // Podría variar según tipo de cuenta, se mantiene estándar del prompt

            const paypalSendCommission = (instructorNetPay * paypalSendPercentage) + paypalSendFee;
            // $40.34 * 0.04 = 1.61 + 4.00 = 5.61 

            const totalPaypalCommissions = paypalReceiveCommission + paypalSendCommission;

            // 5️⃣ Ganancia Operativa de la Plataforma
            const platformOperatingProfit = platformShare - paypalSendCommission;
            // platformShare ($50.80) - paypalSendCommission ($5.61) = 45.19

            // 6️⃣ Impuestos de la Plataforma
            const platformISR = platformOperatingProfit * 0.10; // 10%
            const platformIVA = platformOperatingProfit * 0.16; // 16% standard IVA MX
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
                gross_earning: instructorShare, // $50.80
                isr_retention: isrRetention,
                iva_retention: ivaRetention,
                total_retention: totalRetentions,
                net_pay: instructorNetPay,
                paypal_send_commission: paypalSendCommission,
                status: 'pending',
                month: month,
                year: year
            });

            // 💾 Guardar PlatformCommissionBreakdown (Solo una vez por venta si es curso único, o por item)
            // Asumimos desglose por ITEM para máxima granularidad
            await models.PlatformCommissionBreakdown.create({
                sale: sale._id,
                sale_amount: saleAmount,
                paypal_receive_commission: paypalReceiveCommission,
                paypal_send_commission: paypalSendCommission,
                total_paypal_commissions: totalPaypalCommissions,
                net_after_paypal_receive: netAfterPaypalReceive,
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
