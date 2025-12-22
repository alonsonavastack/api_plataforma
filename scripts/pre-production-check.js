#!/usr/bin/env node

/**
 * 🔍 SCRIPT DE VERIFICACIÓN PRE-PRODUCCIÓN
 * 
 * Este script verifica que todo esté configurado correctamente antes de desplegar a producción.
 * 
 * Uso:
 *   node scripts/pre-production-check.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

let errors = 0;
let warnings = 0;
let checks = 0;

console.log(`
═══════════════════════════════════════════════════════════════
🔍 VERIFICACIÓN PRE-PRODUCCIÓN
═══════════════════════════════════════════════════════════════
`);

// Helper functions
function error(message) {
  console.log(`${colors.red}❌ ERROR:${colors.reset} ${message}`);
  errors++;
  checks++;
}

function warning(message) {
  console.log(`${colors.yellow}⚠️  WARNING:${colors.reset} ${message}`);
  warnings++;
  checks++;
}

function success(message) {
  console.log(`${colors.green}✅${colors.reset} ${message}`);
  checks++;
}

function info(message) {
  console.log(`${colors.blue}ℹ️${colors.reset}  ${message}`);
}

function section(title) {
  console.log(`\n${colors.magenta}═══ ${title} ═══${colors.reset}`);
}

// 1. VERIFICAR ARCHIVO .env
section('VERIFICACIÓN DE ARCHIVO .env');

let envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  error('.env no existe. Copia .env.example a .env');
} else {
  success('.env existe');
  
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const envLines = envContent.split('\n');
  const envVars = {};
  
  envLines.forEach(line => {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) {
      envVars[match[1]] = match[2];
    }
  });
  
  // Verificar variables críticas
  const criticalVars = [
    'MONGO_URI',
    'JWT_SECRETO',
    'PUERTO',
    'NODE_ENV',
    'URL_BACKEND',
    'URL_FRONTEND',
    'PAYPAL_MODE',
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET'
  ];
  
  criticalVars.forEach(varName => {
    if (!envVars[varName] || envVars[varName].includes('REEMPLAZAR') || envVars[varName].includes('tu_')) {
      error(`${varName} no está configurado correctamente`);
    } else {
      success(`${varName} configurado`);
    }
  });
  
  // Verificar JWT_SECRETO
  if (envVars.JWT_SECRETO) {
    if (envVars.JWT_SECRETO.length < 32) {
      error(`JWT_SECRETO es muy corto (${envVars.JWT_SECRETO.length} chars). Mínimo 32, recomendado 64+`);
    } else if (envVars.JWT_SECRETO.length < 64) {
      warning(`JWT_SECRETO funciona pero debería tener 64+ caracteres (actual: ${envVars.JWT_SECRETO.length})`);
    } else {
      success(`JWT_SECRETO tiene longitud segura (${envVars.JWT_SECRETO.length} chars)`);
    }
    
    // Verificar que no sea un valor de ejemplo
    const weakSecrets = ['123456', 'password', 'secret', 'super-secreto-largo'];
    if (weakSecrets.some(weak => envVars.JWT_SECRETO.includes(weak))) {
      error('JWT_SECRETO parece ser un valor de ejemplo. Genera uno nuevo con: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    }
  }
  
  // Verificar NODE_ENV para producción
  if (envVars.NODE_ENV !== 'production') {
    warning(`NODE_ENV es "${envVars.NODE_ENV}". En producción debe ser "production"`);
  } else {
    success('NODE_ENV = production ✓');
  }
  
  // Verificar PayPal Mode
  if (envVars.PAYPAL_MODE !== 'live') {
    warning(`PAYPAL_MODE es "${envVars.PAYPAL_MODE}". En producción debe ser "live"`);
    info('Recuerda obtener las credenciales LIVE de PayPal: https://developer.paypal.com/dashboard/applications/live');
  } else {
    success('PAYPAL_MODE = live ✓');
  }
  
  // Verificar URLs
  if (envVars.URL_BACKEND && envVars.URL_BACKEND.includes('localhost')) {
    warning('URL_BACKEND aún apunta a localhost. Actualiza con tu dominio de producción');
  }
  
  if (envVars.URL_FRONTEND && envVars.URL_FRONTEND.includes('localhost')) {
    warning('URL_FRONTEND aún apunta a localhost. Actualiza con tu dominio de producción');
  }
}

// 2. VERIFICAR FRONTEND ENVIRONMENTS
section('VERIFICACIÓN DE FRONTEND');

const frontendEnvProd = path.join(__dirname, '../../cursos/src/environments/environment.prod.ts');
if (!fs.existsSync(frontendEnvProd)) {
  error('environment.prod.ts NO EXISTE en el frontend');
} else {
  success('environment.prod.ts existe');
  
  const prodContent = fs.readFileSync(frontendEnvProd, 'utf-8');
  
  if (prodContent.includes('localhost')) {
    error('environment.prod.ts contiene referencias a localhost');
  } else {
    success('environment.prod.ts no contiene localhost');
  }
  
  if (prodContent.includes('TU_CLIENT_ID_DE_PRODUCCION_AQUI') || prodContent.includes('tudominio.com')) {
    warning('environment.prod.ts contiene valores placeholder. Actualiza con tus valores reales');
  }
}

// 3. VERIFICAR .gitignore
section('VERIFICACIÓN DE .gitignore');

const gitignorePath = path.join(__dirname, '../.gitignore');
if (!fs.existsSync(gitignorePath)) {
  error('.gitignore no existe');
} else {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  
  if (!gitignoreContent.includes('.env')) {
    error('.gitignore NO incluye .env - ¡CRÍTICO!');
  } else {
    success('.env está en .gitignore');
  }
  
  if (!gitignoreContent.includes('node_modules')) {
    warning('node_modules no está en .gitignore');
  } else {
    success('node_modules está en .gitignore');
  }
}

// 4. VERIFICAR DEPENDENCIAS
section('VERIFICACIÓN DE DEPENDENCIAS');

const packagePath = path.join(__dirname, '../package.json');
if (fs.existsSync(packagePath)) {
  const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  
  const securityDeps = [
    'helmet',
    'express-mongo-sanitize',
    'express-rate-limit',
    'hpp',
    'cors'
  ];
  
  securityDeps.forEach(dep => {
    if (packageData.dependencies && packageData.dependencies[dep]) {
      success(`${dep} instalado`);
    } else {
      error(`${dep} NO está instalado - CRÍTICO para seguridad`);
    }
  });
} else {
  error('package.json no encontrado');
}

// 5. VERIFICAR ARCHIVOS SENSIBLES NO VERSIONADOS
section('VERIFICACIÓN DE ARCHIVOS NO VERSIONADOS');

info('Verificando que archivos sensibles no estén en Git...');

try {
  const { execSync } = await import('child_process');
  
  const gitFiles = execSync('git ls-files', { cwd: path.join(__dirname, '..'), encoding: 'utf-8' });
  
  if (gitFiles.includes('.env\n') || gitFiles.includes('.env ')) {
    error('¡CRÍTICO! .env está versionado en Git. Ejecuta: git rm --cached .env');
  } else {
    success('.env NO está versionado en Git');
  }
  
  if (gitFiles.includes('node_modules')) {
    warning('node_modules está versionado (no debería)');
  }
  
} catch (e) {
  warning('No se pudo verificar archivos de Git (¿estás en un repositorio Git?)');
}

// 6. VERIFICAR CONEXIÓN A MONGODB (si podemos)
section('VERIFICACIÓN DE CONEXIÓN (opcional)');
info('Para verificar conexión a MongoDB, ejecuta el servidor y revisa /api/health');
info('curl http://localhost:3000/api/health');

// 7. CHECKLIST ADICIONAL
section('CHECKLIST ADICIONAL');

info('\n📋 Verifica manualmente:');
console.log(`
  [ ] Tienes backup de la base de datos
  [ ] Has probado el flujo completo de compra en sandbox
  [ ] Las credenciales de PayPal son de modo LIVE (no sandbox)
  [ ] Tienes configurado HTTPS en tu dominio
  [ ] Tienes configurado monitoreo (UptimeRobot, etc.)
  [ ] Has probado los endpoints: /api/health, /api/ready, /api/live
  [ ] Has configurado las variables de entorno en tu hosting
  [ ] Has actualizado las URLs en environment.prod.ts
  [ ] Has probado todo en un entorno de staging primero
`);

// RESUMEN FINAL
console.log(`
═══════════════════════════════════════════════════════════════
📊 RESUMEN DE VERIFICACIÓN
═══════════════════════════════════════════════════════════════
  Total checks: ${checks}
  ✅ Éxitos: ${checks - errors - warnings}
  ⚠️  Warnings: ${warnings}
  ❌ Errores: ${errors}
═══════════════════════════════════════════════════════════════
`);

if (errors > 0) {
  console.log(`${colors.red}
⛔ HAY ${errors} ERRORES CRÍTICOS QUE DEBES RESOLVER ANTES DE PRODUCCIÓN
${colors.reset}`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`${colors.yellow}
⚠️  Hay ${warnings} warnings. Revisa antes de ir a producción.
${colors.reset}`);
  process.exit(0);
} else {
  console.log(`${colors.green}
🎉 ¡TODO LUCE BIEN! Estás listo para producción.
${colors.reset}
Recuerda:
  1. Hacer backup de la BD
  2. Probar en staging primero
  3. Monitorear de cerca las primeras horas

¡Buena suerte! 🚀
`);
  process.exit(0);
}
