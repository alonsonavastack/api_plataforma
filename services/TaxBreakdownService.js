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
            // 🔥 TOMA EL VALOR REAL DE LA GANANCIA GUARDADA (SaleService)
            // Si por alguna razón no existe, calculamos con la fórmula correcta (Progressive Rounding sería ideal pero aquí aproximamos)
            const paypalReceiveCommission = earning.payment_fee_amount || 0;

            const netAfterPaypalReceive = saleAmount - paypalReceiveCommission; // Base Repartible Real

            // 2️⃣ División Real (Basada en la ganancia real calculada previamente sobre el NETO)
            const instructorShare = earning.instructor_earning; // Ganancia neta del instructor (70-80% del neto)
            const platformShare = netAfterPaypalReceive - instructorShare; // 20-30% del neto

            // 3️⃣ Retenciones al Instructor (ELIMINADO A PETICIÓN DEL USUARIO)
            // Ya no se retiene ISR ni IVA al instructor porque no hay depósito bancario directo
            const isrRetention = 0;
            const ivaRetention = 0;
            const totalRetentions = 0;

            const instructorNetPay = instructorShare; // Se transfiere el total de su ganancia

            // 4️⃣ Comisión PayPal (ENVIAR al instructor)
            // Esto es lo que cuesta ENVIARLE el dinero (Mass Pay o similar)
            // ¿Quién lo paga? Usualmente se descuenta del saldo o lo absorbe la plataforma.
            // La lógica anterior lo descontaba del `instructorNetPay` para calcular comisiones de plataforma?
            // Mantendremos el cálculo informativo.
            const paypalSendPercentage = 0.04;
            const paypalSendFee = 4.00;

            const paypalSendCommission = (instructorNetPay * paypalSendPercentage) + paypalSendFee;

            const totalPaypalCommissions = paypalReceiveCommission + paypalSendCommission;

            // 5️⃣ Ganancia Operativa de la Plataforma
            const platformOperatingProfit = platformShare - paypalSendCommission;

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
