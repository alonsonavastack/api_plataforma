import { calculatePaymentSplit } from './utils/commissionCalculator.js';

console.log('--- Verificación de Split de Pagos PayPal MX (CON IVA - Requerido para coincidir con $5.33) ---');

const testCases = [15, 100, 200, 1000];

testCases.forEach(amount => {
    const result = calculatePaymentSplit(amount);
    console.log(`\nMonto: $${amount}`);
    // Fee esperado con IVA: ((15 * 0.0395) + 4) * 1.16 = 5.33
    console.log(`PayPal Fee: $${result.paypalFee} (Esperado para $15: ~$5.33)`);
    // Neto esperado: 15 - 5.33 = 9.67
    console.log(`Neto: $${result.netAmount} (Esperado para $15: ~$9.67)`);
    // Vendor esperado: 9.67 * 0.70 = 6.769 -> 6.77
    console.log(`Vendor (70%): $${result.vendorShare} (Esperado para $15: ~$6.77)`);
    console.log(`Plataforma (30%): $${result.platformShare}`);
});
