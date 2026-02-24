/**
 * SCRIPT v2: Corregir InstructorEarnings con comision incorrecta
 *
 * Problemas que resuelve:
 *  1. Corrige default_commission_rate en PlatformCommissionSettings de 60% a 30%
 *  2. Recalcula todos los earnings no pagados con Stripe MX (3.6% + $3 MXN + IVA)
 *     aplicando comision 30% plataforma / 70% instructor
 *
 * Ejemplo real:
 *   Venta $100 MXN  →  Fee $7.66  →  Neto $92.34
 *   ANTES (60%): instructor = $92.34 × 0.40 = $36.94  ← incorrecto
 *   AHORA (30%): instructor = $92.34 × 0.70 = $64.64  ← correcto
 *
 * Uso:
 *   node fix_earnings_commission.js             → aplica cambios reales
 *   node fix_earnings_commission.js --dry-run   → solo muestra, sin guardar
 *   node fix_earnings_commission.js --id=XXX    → solo ese earning
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Importar models/index.js para registrar TODOS los schemas en mongoose
// (necesario para que populate funcione correctamente)
import './models/index.js';
import InstructorEarnings from './models/InstructorEarnings.js';
import PlatformCommissionSettings from './models/PlatformCommissionSettings.js';

const isDryRun   = process.argv.includes('--dry-run');
const specificId = process.argv.find(a => a.startsWith('--id='))?.split('=')[1];

// ─── Constantes ───────────────────────────────────────────────────────────────
const CORRECT_COMMISSION_RATE = 30;  // 30% plataforma → 70% instructor
const STRIPE_PCT   = 0.036;
const STRIPE_FIXED = 3.00;
const IVA          = 1.16;

function calcStripeFee(amount) {
    return parseFloat(((amount * STRIPE_PCT + STRIPE_FIXED) * IVA).toFixed(2));
}

function recalculate(salePrice, paymentMethod, correctRate) {
    let fee      = 0;
    let netAmount = salePrice;

    if (['stripe', 'mixed_stripe'].includes(paymentMethod)) {
        fee       = calcStripeFee(salePrice);
        netAmount = parseFloat((salePrice - fee).toFixed(2));
    }

    const platformCommission = parseFloat((netAmount * correctRate).toFixed(2));
    const instructorEarning  = parseFloat((netAmount - platformCommission).toFixed(2));

    return { fee, netAmount, platformCommission, instructorEarning };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('\n✅ Conectado a MongoDB');
    console.log(isDryRun ? '🔍 MODO DRY-RUN - sin cambios reales\n' : '⚡ MODO REAL - aplicando cambios\n');

    // ── PASO 1: Corregir configuracion global de comisiones ──────────────────
    const settings    = await PlatformCommissionSettings.getSettings();
    const currentPct  = settings.default_commission_rate;
    const correctRate = CORRECT_COMMISSION_RATE / 100; // 0.30

    console.log(`📋 PlatformCommissionSettings.default_commission_rate actual: ${currentPct}%`);

    if (currentPct !== CORRECT_COMMISSION_RATE) {
        console.log(`⚠️  Esta en ${currentPct}% — debe ser ${CORRECT_COMMISSION_RATE}%`);
        if (!isDryRun) {
            settings.default_commission_rate = CORRECT_COMMISSION_RATE;
            await settings.save();
            console.log(`✅ Corregida a ${CORRECT_COMMISSION_RATE}% en BD\n`);
        } else {
            console.log(`   (dry-run: no actualizada)\n`);
        }
    } else {
        console.log(`✅ Ya esta en ${CORRECT_COMMISSION_RATE}%\n`);
    }

    // ── PASO 2: Corregir earnings ─────────────────────────────────────────────
    const query = {
        status: { $nin: ['paid', 'refunded', 'cancelled'] },
        sale_price: { $gt: 0 }
    };
    if (specificId) {
        query._id = specificId;
        console.log(`🎯 Solo procesando earning: ${specificId}\n`);
    }

    // Sin .populate() para evitar MissingSchemaError en script standalone
    const earnings = await InstructorEarnings.find(query);
    console.log(`📦 Earnings a revisar: ${earnings.length}\n`);

    let totalReviewed = 0, needsUpdate = 0, updated = 0, alreadyOk = 0, errors = 0;

    for (const earning of earnings) {
        totalReviewed++;
        try {
            const salePrice     = earning.sale_price;
            const paymentMethod = earning.payment_method ?? 'stripe';
            const correct       = recalculate(salePrice, paymentMethod, correctRate);

            const curEarning    = earning.instructor_earning        ?? 0;
            const curFee        = earning.payment_fee_amount        ?? 0;
            const curCommission = earning.platform_commission_amount ?? 0;
            const curRate       = earning.platform_commission_rate   ?? 0;

            const earningDiff = Math.abs(curEarning - correct.instructorEarning);
            const feeDiff     = Math.abs(curFee     - correct.fee);
            const rateDiff    = Math.abs(curRate     - correctRate);
            const needsFix    = earningDiff > 0.01 || feeDiff > 0.01 || rateDiff > 0.001;

            console.log(`─────────────────────────────────────────────────`);
            console.log(`📄 Earning  : ${earning._id}`);
            console.log(`   Metodo   : ${paymentMethod}`);
            console.log(`   Precio   : $${salePrice.toFixed(2)} MXN`);
            console.log(`   Fee      : $${curFee.toFixed(2)} → correcto: $${correct.fee.toFixed(2)}  ${feeDiff > 0.01 ? '❌' : '✅'}`);
            console.log(`   Neto     : $${(salePrice - curFee).toFixed(2)} → correcto: $${correct.netAmount.toFixed(2)}`);
            console.log(`   Tasa     : ${(curRate * 100).toFixed(0)}% → correcto: ${CORRECT_COMMISSION_RATE}%  ${rateDiff > 0.001 ? '❌' : '✅'}`);
            console.log(`   Plat.    : $${curCommission.toFixed(2)} → correcto: $${correct.platformCommission.toFixed(2)}`);
            console.log(`   Ganancia : $${curEarning.toFixed(2)} → correcto: $${correct.instructorEarning.toFixed(2)}  ${earningDiff > 0.01 ? '❌' : '✅'}`);

            if (!needsFix) {
                console.log(`   → Ya esta correcto ✅`);
                alreadyOk++;
                continue;
            }

            needsUpdate++;
            console.log(`   → NECESITA CORRECCION`);

            if (!isDryRun) {
                await InstructorEarnings.findByIdAndUpdate(earning._id, {
                    $set: {
                        payment_fee_amount:         correct.fee,
                        platform_commission_rate:    correctRate,
                        platform_commission_amount:  correct.platformCommission,
                        instructor_earning:          correct.instructorEarning,
                        instructor_earning_usd:      correct.instructorEarning,
                    }
                });
                console.log(`   → Actualizado ✅`);
                updated++;
            }

        } catch (err) {
            console.error(`   ❌ ERROR: ${err.message}`);
            errors++;
        }
    }

    // ── Resumen ───────────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`📊 RESUMEN FINAL`);
    console.log(`   Total revisados  : ${totalReviewed}`);
    console.log(`   Ya correctos     : ${alreadyOk}`);
    console.log(`   Necesitaban fix  : ${needsUpdate}`);
    if (!isDryRun) {
        console.log(`   Actualizados     : ${updated}`);
        if (errors > 0) console.log(`   Errores          : ${errors}`);
        if (updated > 0) {
            console.log(`\n🎉 Hecho! Recarga la pagina para ver los valores corregidos.`);
        }
    } else {
        console.log(`   (dry-run: sin cambios guardados)`);
        if (needsUpdate > 0) {
            console.log(`\n👆 Corre sin --dry-run para aplicar los ${needsUpdate} cambios.`);
        }
    }
    console.log(`═══════════════════════════════════════════════════\n`);

    await mongoose.disconnect();
    process.exit(0);
};

run().catch(err => {
    console.error('❌ Error fatal:', err.message);
    process.exit(1);
});
