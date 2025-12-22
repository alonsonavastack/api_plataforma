#!/usr/bin/env node
/**
 * Ejecuta generateCFDI para una retención dada directamente (sin pasar por auth)
 * Uso: node scripts/run_generate_cfdi_local.js <RETENTION_ID>
 */
import TaxBreakdownController from '../controllers/TaxBreakdownController.js';

const retentionId = process.argv[2];
if (!retentionId) {
  console.error('Usage: node scripts/run_generate_cfdi_local.js <RETENTION_ID>');
  process.exit(1);
}

import mongoose from 'mongoose';
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

// Ensure DB connection for this script
const uri = readEnvVar('MONGO_URI') || process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI no configurado en .env');
  process.exit(1);
}
await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
console.log('Conectado a MongoDB (script)');

// Mock req/res
const req = {
  body: { retention_id: retentionId },
  protocol: 'http',
  get: (k) => {
    if (k === 'host') return 'localhost:3000';
    return '';
  }
};

const res = {
  status(code) { this._code = code; return this; },
  json(obj) { console.log('HTTP', this._code || 200, JSON.stringify(obj, null, 2)); }
};

(async () => {
  await TaxBreakdownController.generateCFDI(req, res);
})();
