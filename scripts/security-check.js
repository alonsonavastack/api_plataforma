// ═══════════════════════════════════════════════════════════════════════
// 🔍 SCRIPT DE VERIFICACIÓN DE SEGURIDAD
// ═══════════════════════════════════════════════════════════════════════

import { runSecurityCheck, protectEnvFile } from '../config/securityHardening.js';

// SILENCIADO: // SILENCIADO('\n🔐 EJECUTANDO VERIFICACIÓN DE SEGURIDAD...\n');

// Proteger .env primero
protectEnvFile();

// Ejecutar checks
runSecurityCheck()
  .then(result => {
    if (result.passed < result.total) {
// SILENCIADO: // SILENCIADO('\n⚠️  Algunas verificaciones fallaron. Revisa los detalles arriba.\n');
      process.exit(1);
    } else {
// SILENCIADO: // SILENCIADO('\n✅ Todas las verificaciones pasaron exitosamente!\n');
      process.exit(0);
    }
  })
  .catch(error => {
// SILENCIADO: // SILENCIADO('\n❌ Error en verificación:', error);
    process.exit(1);
  });
