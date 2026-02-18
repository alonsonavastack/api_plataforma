import { calculatePaymentSplit } from './utils/commissionCalculator.js';

console.log('--- Verificación de Split de Pagos PayPal MX (SIN IVA) ---');

const testCases = [15, 100, 200, 1000];

testCases.forEach(amount => {
    const result = calculatePaymentSplit(amount);
    console.log(`\nMonto: $${amount}`);
    // Fee esperado: (15 * 0.0395) + 4 = 0.5925 + 4 = 4.5925 -> 4.59
    console.log(`PayPal Fee: $${result.paypalFee} (Esperado para $15: ~$4.59)`);
    // Neto esperado: 15 - 4.59 = 10.41
    console.log(`Neto: $${result.netAmount} (Esperado para $15: ~$10.41)`);
    // Vendor esperado: 10.41 * 0.70 = 7.287 -> 7.29
    console.log(`Vendor (70%): $${result.vendorShare} (Esperado para $15: ~$7.29)`);
    console.log(`Plataforma (30%): $${result.platformShare}`);
});
