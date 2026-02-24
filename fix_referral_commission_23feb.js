/**
 * 🔧 Script one-shot: corrige earnings con cupón de referido mal calculados (30% en vez de 20%)
 * Uso: node fix_referral_commission_23feb.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import models from './models/index.js';
import { calculatePaymentSplit } from './utils/commissionCalculator.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB');

    const settings = await models.PlatformCommissionSettings.findOne();
    const REFERRAL_RATE = (settings?.referral_commission_rate ?? 20) / 100; // 0.20
    console.log(`🏛 Tasa referido configurada: ${(REFERRAL_RATE * 100)}% plataforma`);

    // Buscar todas las ventas marcadas como referido con código de cupón
    const referralSales = await models.Sale.find({
        is_referral: true,
        coupon_code: { $ne: null },
        status: 'Pagado'
    }).lean();

    console.log(`\n📋 Ventas referido encontradas: ${referralSales.length}`);

    let fixed = 0, skipped = 0;

    for (const sale of referralSales) {
        const coupon = await models.Coupon.findOne({
            code: sale.coupon_code.trim().toUpperCase()
        }).lean();

        if (!coupon) {
            console.warn(`  ⚠️ Cupón "${sale.coupon_code}" no encontrado para venta ${sale._id}`);
            skipped++;
            continue;
        }

        for (const item of sale.detail) {
            // Normalizar productId
            const rawProduct = item.product;
            const productId = (rawProduct && typeof rawProduct === 'object' && rawProduct._id)
                ? rawProduct._id
                : rawProduct;

            const earning = await models.InstructorEarnings.findOne({
                sale: sale._id,
                product_id: productId
            });

            if (!earning) {
                console.warn(`  ⚠️ Earning no encontrado: venta=${sale._id} producto=${productId}`);
                skipped++;
                continue;
            }

            // Verificar si ya está correcto
            if (earning.is_referral && Math.abs(earning.platform_commission_rate - REFERRAL_RATE) < 0.001) {
                console.log(`  ℹ️ Ya correcto: earning ${earning._id} (${(REFERRAL_RATE*100)}%)`);
                skipped++;
                continue;
            }

            // Verificar que el cupón aplica a este instructor y producto
            const instructorMatch = coupon.instructor.toString() === earning.instructor.toString();
            const productIdStr = productId.toString();
            const productMatch = coupon.projects.some(p => p.toString() === productIdStr);

            if (!instructorMatch || !productMatch) {
                console.warn(`  ⚠️ Cupón no aplica: instrMatch=${instructorMatch} prodMatch=${productMatch}`);
                skipped++;
                continue;
            }

            // Recalcular con la tasa correcta
            const isWallet = sale.method_payment === 'wallet';
            const splitResult = isWallet
                ? { paypalFee: 0, netAmount: item.price_unit }
                : calculatePaymentSplit(item.price_unit, 'stripe');

            const netSale = splitResult.netAmount;
            const newPlatComm = parseFloat((netSale * REFERRAL_RATE).toFixed(2));
            const newInstrEarning = parseFloat((netSale - newPlatComm).toFixed(2));

            console.log(`\n  🔧 Corrigiendo earning ${earning._id}`);
            console.log(`     Venta: ${sale.n_transaccion} | Producto: ${item.title}`);
            console.log(`     Comisión plataforma: ${(earning.platform_commission_rate*100).toFixed(0)}% (${earning.platform_commission_amount}) → ${(REFERRAL_RATE*100)}% (${newPlatComm})`);
            console.log(`     Ganancia instructor: ${earning.instructor_earning} → ${newInstrEarning}`);

            await models.InstructorEarnings.updateOne(
                { _id: earning._id },
                {
                    $set: {
                        platform_commission_rate: REFERRAL_RATE,
                        platform_commission_amount: newPlatComm,
                        instructor_earning: newInstrEarning,
                        instructor_earning_usd: newInstrEarning,
                        is_referral: true
                    }
                }
            );

            console.log(`  ✅ Corregido`);
            fixed++;
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Completado: ${fixed} corregidos | ${skipped} omitidos`);
    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
