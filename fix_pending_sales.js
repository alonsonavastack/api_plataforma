/**
 * 🔧 Script: limpia ventas Pendiente huérfanas de Stripe y devuelve wallet reservada
 * 
 * Uso:
 *   node --env-file .env fix_pending_sales.js
 */

import mongoose from 'mongoose';
import models from './models/index.js';
import stripeDefault from './services/stripe.service.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Buscar todas las ventas Pendiente de Stripe de las últimas 24h
    const pendingSales = await models.Sale.find({
        status: 'Pendiente',
        method_payment: { $in: ['stripe', 'mixed_stripe'] },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).lean();

    console.log(`📋 Ventas Pendiente encontradas: ${pendingSales.length}\n`);

    let cancelled = 0, kept = 0, walletRefunded = 0;

    for (const sale of pendingSales) {
        process.stdout.write(`  Venta ${sale._id} (${sale.n_transaccion}) — `);

        // Verificar si la sesión Stripe sigue activa
        if (sale.stripe_session_id) {
            try {
                const session = await stripeDefault.checkout.sessions.retrieve(sale.stripe_session_id);
                if (session && session.status === 'open') {
                    console.log(`✅ Sesión activa — mantenida`);
                    kept++;
                    continue;
                }
                if (session && session.payment_status === 'paid') {
                    console.log(`💳 Ya pagada — marcar como Pagado manualmente`);
                    kept++;
                    continue;
                }
                console.log(`⏰ Sesión ${session?.status || 'desconocida'} — anulando`);
            } catch (e) {
                console.log(`❌ Error Stripe (${e.message?.slice(0, 50)}) — anulando`);
            }
        } else {
            console.log(`🔴 Sin session_id — anulando`);
        }

        // Devolver wallet si había reserva
        if (sale.wallet_amount && sale.wallet_amount > 0) {
            const wallet = await models.Wallet.findOne({ user: sale.user });
            if (wallet) {
                wallet.balance = parseFloat((wallet.balance + sale.wallet_amount).toFixed(2));
                wallet.transactions.push({
                    user: sale.user,
                    type: 'refund',
                    amount: sale.wallet_amount,
                    balanceAfter: wallet.balance,
                    description: `Reembolso automático - venta cancelada ${sale.n_transaccion}`,
                    date: new Date(),
                    metadata: { orderId: sale._id, reason: 'Limpieza de venta pendiente' }
                });
                await wallet.save();
                console.log(`     💰 Wallet devuelto: $${sale.wallet_amount} MXN (nuevo balance: $${wallet.balance})`);
                walletRefunded++;
            }
        }

        // Anular la venta
        await models.Sale.updateOne({ _id: sale._id }, { status: 'Anulado' });
        console.log(`     ✅ Venta anulada`);
        cancelled++;
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Completado:`);
    console.log(`   ${cancelled} ventas anuladas`);
    console.log(`   ${walletRefunded} wallets reembolsados`);
    console.log(`   ${kept} ventas activas mantenidas`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
