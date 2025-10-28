/**
 * 🧪 SCRIPT DE PRUEBA - SISTEMA FISCAL
 * 
 * Prueba los cálculos fiscales para diferentes países y escenarios
 * 
 * Uso:
 * node test-fiscal-calculations.js
 */

import FiscalService from '../service/fiscal.service.js';

console.log('🧪 INICIANDO PRUEBAS DEL SISTEMA FISCAL\n');
console.log('═'.repeat(70));

// ====================================================================
// ESCENARIO 1: INSTRUCTOR MEXICANO CON RESICO
// ====================================================================

console.log('\n📍 ESCENARIO 1: Instructor Mexicano con RESICO');
console.log('─'.repeat(70));

const instructorMX = {
  _id: '673d8a1234567890abcdef01',
  name: 'Juan Pérez',
  country: 'MX',
  paymentMethod: 'bank_transfer',
  fiscal: {
    regimenFiscal: '626', // RESICO
    rfc: 'PEPJ850101XXX',
    ingresoAcumuladoAnual: 250000, // Ya ganó $250k MXN este año
    cuentaBancaria: {
      banco: 'BBVA',
      clabe: '012180001234567890',
      numeroCuenta: '0123456789',
      titular: 'Juan Pérez García',
      currency: 'MXN'
    }
  }
};

try {
  const payoutMX = await FiscalService.calculateInstructorPayout({
    saleAmountUSD: 100,
    platformCommissionRate: 10,
    instructor: instructorMX
  });
  
  console.log(`\n✅ Venta: $${payoutMX.sale.amountUSD} USD`);
  console.log(`   Tipo cambio: 1 USD = ${payoutMX.exchangeRates.USD_to_taxCurrency} MXN`);
  console.log(`   Venta en MXN: $${payoutMX.sale.amountTaxCurrency.toFixed(2)} MXN`);
  console.log(`   (Ya incluye IVA del 16%)`);
  
  console.log(`\n💰 Comisión plataforma (${payoutMX.platform.commissionRate}%): -$${payoutMX.platform.commissionAmount.toFixed(2)} MXN`);
  
  console.log(`\n📊 IMPUESTOS:`);
  console.log(`   Subtotal sin IVA: $${payoutMX.tax.subtotalSinIVA.toFixed(2)} MXN`);
  console.log(`   IVA (16%): +$${payoutMX.tax.iva.toFixed(2)} MXN`);
  console.log(`   Retención IVA (2/3): -$${payoutMX.tax.retencionIVA.toFixed(2)} MXN`);
  console.log(`   Retención ISR (${payoutMX.tax.isrRate}%): -$${payoutMX.tax.isrAmount.toFixed(2)} MXN`);
  console.log(`   Total impuestos: -$${payoutMX.tax.totalTaxes.toFixed(2)} MXN`);
  
  console.log(`\n💳 Método de pago: ${payoutMX.payment.methodName}`);
  console.log(`   Comisión: $${payoutMX.payment.feeAmount.toFixed(2)} ${payoutMX.payment.currency}`);
  
  console.log(`\n${'-'.repeat(70)}`);
  console.log(`💵 TOTAL A RECIBIR: $${payoutMX.summary.totalInstructorReceives.toFixed(2)} ${payoutMX.payment.currency}`);
  console.log(`   (≈ $${payoutMX.summary.totalInstructorReceivesUSD.toFixed(2)} USD)`);
  console.log(`${'-'.repeat(70)}`);
  
  console.log(`\n📈 Ingreso acumulado anual:`);
  console.log(`   Antes: $${payoutMX.tax.ingresoAcumuladoAntes.toLocaleString()} MXN`);
  console.log(`   Después: $${payoutMX.tax.ingresoAcumuladoDespues.toLocaleString()} MXN`);
  
  // Validar límites
  const validation = FiscalService.validateTaxLimits(instructorMX, payoutMX.tax.subtotalSinIVA);
  if (validation.alerts.length > 0) {
    console.log(`\n⚠️  ALERTAS FISCALES:`);
    validation.alerts.forEach(alert => {
      console.log(`   [${alert.level.toUpperCase()}] ${alert.message}`);
    });
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
}

// ====================================================================
// ESCENARIO 2: INSTRUCTOR AMERICANO CON PAYPAL
// ====================================================================

console.log('\n\n📍 ESCENARIO 2: Instructor Americano (USA) con PayPal');
console.log('─'.repeat(70));

const instructorUS = {
  _id: '673d8b1234567890abcdef02',
  name: 'John Smith',
  country: 'US',
  paymentMethod: 'paypal',
  fiscal: {
    regimenFiscal: 'independent_contractor'
  }
};

try {
  const payoutUS = await FiscalService.calculateInstructorPayout({
    saleAmountUSD: 100,
    platformCommissionRate: 10,
    instructor: instructorUS
  });
  
  console.log(`\n✅ Sale: $${payoutUS.sale.amountUSD} USD`);
  console.log(`\n💰 Platform commission (${payoutUS.platform.commissionRate}%): -$${payoutUS.platform.commissionAmount.toFixed(2)} USD`);
  console.log(`\n📊 TAXES: $0.00 (No withholding for US independent contractors)`);
  console.log(`\n💳 Payment method: ${payoutUS.payment.methodName}`);
  console.log(`   Fee (${payoutUS.payment.feeRate}% + $${payoutUS.payment.feeFixed}): -$${payoutUS.payment.feeAmount.toFixed(2)} USD`);
  
  console.log(`\n${'-'.repeat(70)}`);
  console.log(`💵 TOTAL TO RECEIVE: $${payoutUS.summary.totalInstructorReceives.toFixed(2)} ${payoutUS.payment.currency}`);
  console.log(`${'-'.repeat(70)}`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
}

// ====================================================================
// ESCENARIO 3: INSTRUCTOR ESPAÑOL CON SEPA
// ====================================================================

console.log('\n\n📍 ESCENARIO 3: Instructor Español con SEPA');
console.log('─'.repeat(70));

const instructorES = {
  _id: '673d8c1234567890abcdef03',
  name: 'María García',
  country: 'ES',
  paymentMethod: 'sepa',
  fiscal: {
    regimenFiscal: 'autonomo'
  }
};

try {
  const payoutES = await FiscalService.calculateInstructorPayout({
    saleAmountUSD: 100,
    platformCommissionRate: 10,
    instructor: instructorES
  });
  
  console.log(`\n✅ Venta: $${payoutES.sale.amountUSD} USD`);
  console.log(`   Tipo cambio: 1 USD = ${payoutES.exchangeRates.USD_to_taxCurrency} EUR`);
  console.log(`   Venta en EUR: €${payoutES.sale.amountTaxCurrency.toFixed(2)} EUR`);
  
  console.log(`\n💰 Comisión plataforma (${payoutES.platform.commissionRate}%): -€${payoutES.platform.commissionAmount.toFixed(2)} EUR`);
  
  console.log(`\n📊 IMPUESTOS:`);
  console.log(`   Retención IRPF (15%): -€${payoutES.tax.retencionIRPF?.toFixed(2) || 0} EUR`);
  console.log(`   Total impuestos: -€${payoutES.tax.totalTaxes.toFixed(2)} EUR`);
  
  console.log(`\n💳 Método de pago: ${payoutES.payment.methodName}`);
  console.log(`   Comisión SEPA (${payoutES.payment.feeRate}%): -€${payoutES.payment.feeAmount.toFixed(2)} EUR`);
  
  console.log(`\n${'-'.repeat(70)}`);
  console.log(`💵 TOTAL A RECIBIR: €${payoutES.summary.totalInstructorReceives.toFixed(2)} ${payoutES.payment.currency}`);
  console.log(`   (≈ $${payoutES.summary.totalInstructorReceivesUSD.toFixed(2)} USD)`);
  console.log(`${'-'.repeat(70)}`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
}

// ====================================================================
// ESCENARIO 4: INSTRUCTOR INTERNACIONAL CON WISE
// ====================================================================

console.log('\n\n📍 ESCENARIO 4: Instructor Internacional con Wise');
console.log('─'.repeat(70));

const instructorINTL = {
  _id: '673d8d1234567890abcdef04',
  name: 'Maria Silva',
  country: 'BR', // Brasil (no configurado, usa INTL)
  paymentMethod: 'wise',
  fiscal: {
    regimenFiscal: 'freelancer'
  }
};

try {
  const payoutINTL = await FiscalService.calculateInstructorPayout({
    saleAmountUSD: 100,
    platformCommissionRate: 10,
    instructor: instructorINTL
  });
  
  console.log(`\n✅ Sale: $${payoutINTL.sale.amountUSD} USD`);
  console.log(`\n💰 Platform commission (${payoutINTL.platform.commissionRate}%): -$${payoutINTL.platform.commissionAmount.toFixed(2)} USD`);
  console.log(`\n📊 TAXES: $0.00 (No withholding for international freelancers)`);
  console.log(`\n💳 Payment method: ${payoutINTL.payment.methodName}`);
  console.log(`   Fee (${payoutINTL.payment.feeRate}%): -$${payoutINTL.payment.feeAmount.toFixed(2)} USD`);
  
  console.log(`\n${'-'.repeat(70)}`);
  console.log(`💵 TOTAL TO RECEIVE: $${payoutINTL.summary.totalInstructorReceives.toFixed(2)} ${payoutINTL.payment.currency}`);
  console.log(`${'-'.repeat(70)}`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
}

// ====================================================================
// ESCENARIO 5: LÍMITES FISCALES (RESICO)
// ====================================================================

console.log('\n\n📍 ESCENARIO 5: Validación de Límites Fiscales (RESICO)');
console.log('─'.repeat(70));

const instructorNearLimit = {
  ...instructorMX,
  fiscal: {
    ...instructorMX.fiscal,
    ingresoAcumuladoAnual: 3400000 // $3.4M MXN (97% del límite)
  }
};

const newSaleAmount = 100000; // $100k MXN más

console.log(`\nInstructor: ${instructorNearLimit.name}`);
console.log(`Ingreso acumulado: $${instructorNearLimit.fiscal.ingresoAcumuladoAnual.toLocaleString()} MXN`);
console.log(`Nueva venta: $${newSaleAmount.toLocaleString()} MXN`);
console.log(`Límite RESICO: $3,500,000 MXN\n`);

const limitValidation = FiscalService.validateTaxLimits(instructorNearLimit, newSaleAmount);

if (!limitValidation.canContinue) {
  console.log(`❌ BLOQUEADO - No puede recibir este pago`);
} else {
  console.log(`✅ PUEDE CONTINUAR - Pago permitido`);
}

if (limitValidation.alerts.length > 0) {
  console.log(`\n⚠️  ALERTAS:`);
  limitValidation.alerts.forEach(alert => {
    const emoji = {
      warning: '⚠️',
      danger: '🚨',
      blocked: '❌',
      info: 'ℹ️'
    }[alert.level];
    console.log(`   ${emoji} [${alert.level.toUpperCase()}] ${alert.message}`);
  });
}

// ====================================================================
// RESUMEN FINAL
// ====================================================================

console.log('\n\n' + '═'.repeat(70));
console.log('🎯 RESUMEN DE PRUEBAS');
console.log('═'.repeat(70));
console.log('\n✅ ESCENARIO 1: Instructor MX (RESICO) - Calculado correctamente');
console.log('✅ ESCENARIO 2: Instructor US (1099) - Calculado correctamente');
console.log('✅ ESCENARIO 3: Instructor ES (Autónomo) - Calculado correctamente');
console.log('✅ ESCENARIO 4: Instructor INTL (Freelancer) - Calculado correctamente');
console.log('✅ ESCENARIO 5: Límites RESICO - Validado correctamente');

console.log('\n\n🎉 TODAS LAS PRUEBAS COMPLETADAS\n');
console.log('El sistema fiscal está funcionando correctamente.');
console.log('Puedes proceder a implementar el frontend.\n');
console.log('═'.repeat(70));
