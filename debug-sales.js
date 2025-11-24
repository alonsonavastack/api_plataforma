// 🧪 Script de diagnóstico rápido
// Ejecutar en el servidor backend (Node.js)

import mongoose from 'mongoose';
import models from './models/index.js';

// Conectar a MongoDB
await mongoose.connect('mongodb://localhost:27017/agendador_cuenta_halcon');

const userId = '691ca8ae140226c9a89570ef';

// Obtener TODAS las ventas del usuario
const sales = await models.Sale.find({ user: userId })
  .sort({ createdAt: -1 })
  .lean();

console.log('\n🔍 ========== VENTAS DEL USUARIO ==========\n');
console.log(`Total ventas: ${sales.length}\n`);

for (const sale of sales) {
  console.log(`📦 Venta ID: ${sale._id}`);
  console.log(`   💰 Total: $${sale.total}`);
  console.log(`   📊 Status: ${sale.status}`);
  console.log(`   📅 Fecha: ${sale.createdAt}`);
  console.log(`   🆔 Transacción: ${sale.n_transaccion}`);
  
  if (sale.detail && sale.detail.length > 0) {
    console.log(`   📦 Productos comprados:`);
    for (const item of sale.detail) {
      console.log(`      • ID: ${item.product}`);
      console.log(`      • Tipo: ${item.product_type}`);
      console.log(`      • Título: ${item.title}`);
      console.log(`      • Precio: $${item.price_unit}`);
    }
  }
  
  // Verificar si tiene reembolso
  const refund = await models.Refund.findOne({
    sale: sale._id,
    status: { $in: ['pending', 'approved', 'processing', 'completed'] },
    state: 1
  });
  
  if (refund) {
    console.log(`   ❌ TIENE REEMBOLSO: ${refund.status}`);
  } else {
    console.log(`   ✅ SIN REEMBOLSO - Debería mostrar badge`);
  }
  
  console.log('');
}

console.log('🔍 ========== FIN ==========\n');

process.exit(0);
