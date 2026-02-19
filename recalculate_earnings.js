/**
 * 🔧 SCRIPT: Recalcular InstructorEarnings existentes
 *
 * Corrige los earnings que fueron calculados SIN IVA en el fee de PayPal.
 * Fórmula CORRECTA: (sale_price × 3.95% + $4.00) × 1.16 (IVA)
 *
 * Uso: node recalculate_earnings.js [--dry-run] [--id=EARNING_ID]
 *
 * --dry-run : Solo muestra los cambios sin guardarlos
 * --id      : Procesar solo un earning específico
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import InstructorEarnings from './models/InstructorEarnings.js';
import { calculatePaymentSplit } from './utils/commissionCalculator.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const isDryRun = process.argv.includes('--dry-run');
const specificId = process.argv.find(a => a.startsWith('--id='))?.split('=')[1];

const run = async () => {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB');
    console.log(isDryRun ? '🔍 MODO DRY-RUN (sin cambios reales)' : '⚡ MODO REAL (aplicando cambios)');
    console.log('');

    // Filtrar: solo earnings que NO han sido pagados ni reembolsados
    const query = {
        status: { $nin: ['paid', 'refunded', 'cancelled'] },
        sale_price: { $gt: 0 },
    };
    if (specificId) {
        query._id = specificId;
        console.log(`🎯 Procesando solo el earning: ${specificId}`);
    }

    const earnings = await InstructorEarnings.find(query);
    console.log(`📦 Earnings a revisar: ${earnings.length}\n`);

    let needsUpdate = 0;
    let updated = 0;
    let alreadyCorrect = 0;

    for (const earning of earnings) {
        const salePrice = earning.sale_price;
        const commissionRate = earning.platform_commission_rate; // ej: 0.30

        // Calcular valores correctos con la fórmula actual (con IVA)
        const split = calculatePaymentSplit(salePrice);

        if (split.netAmount <= 0) continue;

        const correctPlatformCommission = parseFloat((split.netAmount * commissionRate).toFixed(2));
        const correctInstructorEarning = parseFloat((split.netAmount - correctPlatformCommission).toFixed(2));
        const correctPaypalFee = split.paypalFee;

        const currentEarning = earning.instructor_earning;
        const currentFee = earning.payment_fee_amount || 0;

        const earningDiff = Math.abs(currentEarning - correctInstructorEarning);
        const feeDiff = Math.abs(currentFee - correctPaypalFee);

        const needsFix = earningDiff > 0.01 || feeDiff > 0.01;

        console.log(`─────────────────────────────────────────`);
        console.log(`📄 Earning ID: ${earning._id}`);
        console.log(`   Precio venta:       $${salePrice.toFixed(2)}`);
        console.log(`   Tasa comisión:      ${(commissionRate * 100).toFixed(0)}%`);
        console.log(`   Fee PayPal actual:  $${currentFee.toFixed(2)}  →  correcto: $${correctPaypalFee.toFixed(2)}  ${feeDiff > 0.01 ? '❌' : '✅'}`);
        console.log(`   Neto actual (calc): $${(salePrice - currentFee).toFixed(2)}  →  correcto: $${split.netAmount.toFixed(2)}`);
        console.log(`   Ganancia actual:    $${currentEarning.toFixed(2)}  →  correcto: $${correctInstructorEarning.toFixed(2)}  ${earningDiff > 0.01 ? '❌' : '✅'}`);

        if (!needsFix) {
            console.log(`   ✅ Ya está correcto, sin cambios.`);
            alreadyCorrect++;
            continue;
        }

        needsUpdate++;
        console.log(`   ⚠️  NECESITA CORRECCIÓN`);

        if (!isDryRun) {
            await InstructorEarnings.findByIdAndUpdate(earning._id, {
                $set: {
                    payment_fee_amount: correctPaypalFee,
                    platform_commission_amount: correctPlatformCommission,
                    instructor_earning: correctInstructorEarning,
                }
            });
            console.log(`   ✅ Actualizado en BD`);
            updated++;
        }
    }

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`📊 RESUMEN:`);
    console.log(`   Total revisados:   ${earnings.length}`);
    console.log(`   Ya correctos:      ${alreadyCorrect}`);
    console.log(`   Necesitan fix:     ${needsUpdate}`);
    if (!isDryRun) console.log(`   Actualizados:      ${updated}`);
    else console.log(`   (dry-run: no se aplicaron cambios)`);
    console.log(`═══════════════════════════════════════════\n`);

    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
    process.exit(0);
};

run().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
