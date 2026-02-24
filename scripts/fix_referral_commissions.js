/**
 * SCRIPT: Corregir comisiones de ventas con cupón de referido
 *
 * Problema que resuelve:
 *   Ventas con is_referral=true fueron procesadas con 30% de comisión
 *   en vez del 20% correcto (80% instructor / 20% plataforma).
 *
 * Ejemplo real (23 feb 2026):
 *   Venta $100 MXN con cupón → Fee Stripe $7.66 → Neto $92.34
 *   MAL  (30%): plataforma = $27.70 | instructor = $64.64
 *   BIEN (20%): plataforma = $18.47 | instructor = $73.87
 *
 * Uso (desde la carpeta api/):
 *   node --env-file .env scripts/fix_referral_commissions.js
 *   node --env-file .env scripts/fix_referral_commissions.js --dry-run
 *   node --env-file .env scripts/fix_referral_commissions.js --id=SALE_ID
 */

import mongoose from 'mongoose';

const isDryRun = process.argv.includes('--dry-run');
const saleArg  = process.argv.find(a => a.startsWith('--id='))?.split('=')[1];

function calcStripeFee(amount) {
    return parseFloat(((amount * 0.036 + 3.00) * 1.16).toFixed(2));
}

function recalculate(salePrice, paymentMethod, referralRate) {
    const isWallet = paymentMethod === 'wallet';
    const fee      = isWallet ? 0 : calcStripeFee(salePrice);
    const netSale  = parseFloat((salePrice - fee).toFixed(2));
    const platformCommission = parseFloat((netSale * referralRate).toFixed(2));
    const instructorEarning  = parseFloat((netSale - platformCommission).toFixed(2));
    return { fee, netSale, platformCommission, instructorEarning };
}

const run = async () => {
    const MONGO_URI = process.env.MONGO_URI || process.env.DB_URL;
    if (!MONGO_URI) {
        console.error('❌ No se encontró MONGO_URI. Corre con: node --env-file .env scripts/fix_referral_commissions.js');
        process.exit(1);
    }

    console.log('\n🔌 Conectando a MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado\n');
    console.log(isDryRun ? '🔍 MODO DRY-RUN — sin cambios reales\n' : '⚡ MODO REAL — aplicando cambios\n');

    const db = mongoose.connection;

    const settingsDoc   = await db.collection('platform_commission_settings').findOne({});
    const REFERRAL_RATE = (settingsDoc?.referral_commission_rate ?? 20) / 100;
    const DEFAULT_RATE  = (settingsDoc?.default_commission_rate  ?? 30) / 100;

    console.log(`📋 Configuración en BD:`);
    console.log(`   Normal  : ${DEFAULT_RATE  * 100}% plataforma → ${(1 - DEFAULT_RATE)  * 100}% instructor`);
    console.log(`   Referido: ${REFERRAL_RATE * 100}% plataforma → ${(1 - REFERRAL_RATE) * 100}% instructor\n`);

    const saleFilter = { is_referral: true, status: 'Pagado', coupon_code: { $ne: null } };
    if (saleArg) {
        saleFilter._id = new mongoose.Types.ObjectId(saleArg);
        console.log(`🎯 Solo venta: ${saleArg}\n`);
    }

    const sales = await db.collection('sales').find(saleFilter).toArray();
    console.log(`📦 Ventas referido encontradas: ${sales.length}\n`);

    if (sales.length === 0) {
        console.log('ℹ️  Sin ventas que procesar.');
        await mongoose.disconnect();
        process.exit(0);
    }

    let totalReviewed = 0, needsUpdate = 0, updated = 0, alreadyOk = 0, skipped = 0, errors = 0;

    for (const sale of sales) {
        console.log(`\n${'═'.repeat(55)}`);
        console.log(`🧾 Venta       : ${sale._id}`);
        console.log(`   Transacción : ${sale.n_transaccion}`);
        console.log(`   Cupón       : ${sale.coupon_code}`);
        console.log(`   Método      : ${sale.method_payment}`);
        console.log(`   Total       : $${sale.total?.toFixed(2)} MXN`);
        console.log(`   Fecha       : ${new Date(sale.createdAt).toLocaleDateString('es-MX')}`);

        const coupon = await db.collection('coupons').findOne({
            code: sale.coupon_code.trim().toUpperCase()
        });

        if (!coupon) {
            console.log(`   ⚠️  Cupón no encontrado en BD — omitiendo`);
            skipped++;
            continue;
        }

        for (const item of (sale.detail || [])) {
            totalReviewed++;
            const productId = item.product?.toString();

            console.log(`\n   ─── ${item.title || productId} ─────────────`);
            console.log(`   💰 Precio: $${item.price_unit?.toFixed(2)} MXN`);

            const productMatch = (coupon.projects || []).some(p => p.toString() === productId);
            if (!productMatch) {
                console.log(`   ⚠️  Producto no está en el cupón — omitiendo`);
                skipped++;
                continue;
            }

            const earning = await db.collection('instructorearnings').findOne({
                sale: sale._id,
                product_id: item.product
            });

            if (!earning) {
                console.log(`   ⚠️  No existe earning — omitiendo`);
                skipped++;
                continue;
            }

            const instructorMatch = coupon.instructor?.toString() === earning.instructor?.toString();
            if (!instructorMatch) {
                console.log(`   ⚠️  Cupón no pertenece al instructor de este earning — omitiendo`);
                skipped++;
                continue;
            }

            const correct = recalculate(item.price_unit, sale.method_payment, REFERRAL_RATE);

            const curFee        = earning.payment_fee_amount          ?? 0;
            const curRate       = earning.platform_commission_rate     ?? 0;
            const curCommission = earning.platform_commission_amount   ?? 0;
            const curEarning    = earning.instructor_earning           ?? 0;

            const rateDiff    = Math.abs(curRate - REFERRAL_RATE);
            const earningDiff = Math.abs(curEarning - correct.instructorEarning);
            const needsFix    = rateDiff > 0.001 || earningDiff > 0.01 || !earning.is_referral;

            console.log(`   Fee Stripe : $${curFee.toFixed(2)} → $${correct.fee.toFixed(2)}       ${Math.abs(curFee - correct.fee) > 0.01 ? '❌' : '✅'}`);
            console.log(`   Tasa plat. : ${(curRate * 100).toFixed(0)}% → ${REFERRAL_RATE * 100}%              ${rateDiff > 0.001 ? '❌' : '✅'}`);
            console.log(`   Comisión   : $${curCommission.toFixed(2)} → $${correct.platformCommission.toFixed(2)}`);
            console.log(`   Ganancia   : $${curEarning.toFixed(2)} → $${correct.instructorEarning.toFixed(2)}     ${earningDiff > 0.01 ? '❌' : '✅'}`);
            console.log(`   is_referral: ${earning.is_referral} → true           ${!earning.is_referral ? '❌' : '✅'}`);

            if (!needsFix) {
                console.log(`   ✅ Ya correcto — sin cambios`);
                alreadyOk++;
                continue;
            }

            const diff = correct.instructorEarning - curEarning;
            needsUpdate++;
            console.log(`   🔧 NECESITA FIX → instructor recupera: +$${diff.toFixed(2)} MXN`);

            if (!isDryRun) {
                try {
                    await db.collection('instructorearnings').updateOne(
                        { _id: earning._id },
                        {
                            $set: {
                                payment_fee_amount:         correct.fee,
                                platform_commission_rate:   REFERRAL_RATE,
                                platform_commission_amount: correct.platformCommission,
                                instructor_earning:         correct.instructorEarning,
                                instructor_earning_usd:     correct.instructorEarning,
                                is_referral:                true
                            }
                        }
                    );
                    console.log(`   ✅ Earning corregido`);
                    updated++;
                } catch (err) {
                    console.error(`   ❌ Error: ${err.message}`);
                    errors++;
                }
            } else {
                console.log(`   (dry-run: no guardado)`);
            }
        }
    }

    console.log(`\n${'═'.repeat(55)}`);
    console.log(`📊 RESUMEN`);
    console.log(`   Revisados  : ${totalReviewed}`);
    console.log(`   Correctos  : ${alreadyOk}`);
    console.log(`   Omitidos   : ${skipped}`);
    console.log(`   Con fix    : ${needsUpdate}`);
    if (!isDryRun) {
        console.log(`   Corregidos : ${updated}`);
        if (errors > 0) console.log(`   Errores    : ${errors} ⚠️`);
        if (updated > 0) console.log(`\n🎉 Listo! Recarga "Mis Ganancias" para ver los valores corregidos.`);
    } else {
        if (needsUpdate > 0) console.log(`\n👆 Corre sin --dry-run para aplicar los ${needsUpdate} cambio(s).`);
        else console.log(`\n✅ Todo correcto, no se requieren cambios.`);
    }
    console.log(`${'═'.repeat(55)}\n`);

    await mongoose.disconnect();
    process.exit(0);
};

run().catch(err => {
    console.error('\n❌ Error fatal:', err.message);
    process.exit(1);
});
