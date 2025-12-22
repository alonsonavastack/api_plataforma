#!/usr/bin/env node
/**
 * Script para crear un usuario instructor de prueba y una retención desde la carpeta api
 * Uso: node scripts/create_test_retention_local.js
 */
import mongoose from 'mongoose';
import models from '../models/index.js';
import fs from 'fs';

function readEnvVar(key, filePath = './.env') {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [k, ...rest] = trimmed.split('=');
      if (k === key) return rest.join('=').trim();
    }
  } catch (err) {
    // ignore
  }
  return process.env[key];
}

async function main() {
  const uri = readEnvVar('MONGO_URI') || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI no configurado en .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Conectado a MongoDB para crear datos de prueba');

  // Crear usuario instructor
  const user = await models.User.create({
    name: 'Test',
    surname: 'Instructor',
    email: `test.instructor.${Date.now()}@example.com`,
    phone: `521${Math.floor(100000000 + Math.random()*900000000)}`,
    rol: 'instructor',
    password: 'password'
  });

  const retention = await models.InstructorRetention.create({
    instructor: user._id,
    sale: new mongoose.Types.ObjectId(),
    earning: new mongoose.Types.ObjectId(),
    gross_earning: 100.00,
    isr_retention: 10.00,
    iva_retention: 10.60,
    total_retention: 20.60,
    net_pay: 79.40,
    paypal_send_commission: 2.00,
    status: 'pending',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  console.log('Usuario creado:', user.email, user._id.toString());
  console.log('Retention creado:', retention._id.toString());

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
