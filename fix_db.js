import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import models from './models/index.js';
import { calculatePaymentSplit } from './utils/commissionCalculator.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI || 'mongodb://127.0.0.1:27017/devhub_sharks';

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB');

    // 1. Force the referral commission rate to 20% in the settings
    await models.PlatformCommissionSettings.updateMany({}, {
        $set: { referral_commission_rate: 20 }
    });
    console.log('✅ referral_commission_rate forced to 20 in PlatformCommissionSettings');

    const REFERRAL_RATE = 0.20; // Hardcode to 20% for the fix

    // 2. Recalculate all past referral earnings!
    const referralSales = await models.Sale.find({
        is_referral: true,
        coupon_code: { $ne: null },
        status: { $in: ['Pagado', 'Aprobado'] } // might be Pagado
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
            const rawProduct = item.product;
            const productId = (rawProduct && typeof rawProduct === 'object' && rawProduct._id)
                ? rawProduct._id
                : rawProduct;

            const earning = await models.InstructorEarnings.findOne({
                sale: sale._id,
                product_id: productId
            });

            if (!earning) {
                skipped++;
                continue;
            }

            // Mismatched rate verification
            if (earning.is_referral && Math.abs(earning.platform_commission_rate - REFERRAL_RATE) < 0.001) {
                skipped++;
                continue;
            }

            const isWallet = sale.method_payment === 'wallet';
            const splitResult = isWallet
                ? { paypalFee: 0, netAmount: item.price_unit }
                : calculatePaymentSplit(item.price_unit, 'stripe');

            const netSale = splitResult.netAmount;
            const newPlatComm = parseFloat((netSale * REFERRAL_RATE).toFixed(2));
            const newInstrEarning = parseFloat((netSale - newPlatComm).toFixed(2));

            console.log(`\n  🔧 Corrigiendo earning ${earning._id} de Venta ${sale.n_transaccion}`);
            console.log(`     Comisión org: ${(earning.platform_commission_rate * 100).toFixed(0)}% → Nueva: 20%`);
            console.log(`     Ganancia instructor: $${earning.instructor_earning} → $${newInstrEarning}`);

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
            fixed++;
        }
    }

    console.log(`\n✅ Completado: ${fixed} corregidos | ${skipped} omitidos`);
    await mongoose.disconnect();
}

main().catch(console.error);
