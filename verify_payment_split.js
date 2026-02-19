import { calculatePaymentSplit } from './utils/commissionCalculator.js';

console.log('--- Verificación de Split de Pagos PayPal MX (Progressive Rounding) ---');

const testCases = [15, 40, 100, 200, 1000]; // 40 represents 200 with 80% off

testCases.forEach(amount => {
    const result = calculatePaymentSplit(amount);
    console.log(`\n--- Monto Pagado: $${amount} ---`);
    console.log(`PayPal Fee: $${result.paypalFee}`);
    console.log(`Neto: $${result.netAmount}`);
    console.log(`Vendor (70%): $${result.vendorShare}`);
    console.log(`Plataforma (30%): $${result.platformShare}`);

    // Verificaciones de integridad (Suma exacta)
    const sumNet = parseFloat((result.vendorShare + result.platformShare).toFixed(2));
    const sumTotal = parseFloat((result.paypalFee + result.netAmount).toFixed(2));

    console.log(`> Check Net: ${result.vendorShare} + ${result.platformShare} = ${sumNet} (Esperado: ${result.netAmount})`);
    console.log(`> Check Total: ${result.paypalFee} + ${result.netAmount} = ${sumTotal} (Esperado: ${amount})`);

    if (sumNet !== result.netAmount) console.error('❌ ERROR: La suma del split no cuadra con el neto');
    else console.log('✅ Split cuadra con Neto');

    if (sumTotal !== result.totalPaid) console.error('❌ ERROR: La suma del desglose no cuadra con el total');
    else console.log('✅ Desglose cuadra con Total');
});
