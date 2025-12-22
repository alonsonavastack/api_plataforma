// scripts/remove-sensitive-logs.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Patrones de logs sensibles a eliminar
const sensitivePatterns = [
  // Passwords
  /console\.log\([^)]*password[^)]*\)/gi,
  /console\.log\([^)]*contraseña[^)]*\)/gi,
  /console\.log\(['"].*password.*['"][^)]*\)/gi,
  
  // Tokens y secrets
  /console\.log\([^)]*token[^)]*\)/gi,
  /console\.log\([^)]*secret[^)]*\)/gi,
  /console\.log\([^)]*jwt[^)]*\)/gi,
  /console\.log\([^)]*api[_-]?key[^)]*\)/gi,
  
  // Credenciales
  /console\.log\([^)]*credential[^)]*\)/gi,
  /console\.log\([^)]*auth[^)]*header[^)]*\)/gi,
  
  // Datos de usuario sensibles
  /console\.log\([^)]*req\.body\.password[^)]*\)/gi,
  /console\.log\([^)]*user\.password[^)]*\)/gi,
  
  // Logs específicos que incluyen emoji con datos sensibles
  /console\.log\(['"]✅[^'"]*password[^)]*\)/gi,
  /console\.log\(['"]🔐[^)]*\)/gi,
];

// Patrones de console.log seguros que NO queremos eliminar
const safePatterns = [
  /console\.log\(['"]✅.*servidor.*iniciado/gi,
  /console\.log\(['"]🚀.*servidor/gi,
  /console\.log\(['"]📊.*estadísticas/gi,
  /console\.log\(['"]⚡.*conectado/gi,
];

let filesScanned = 0;
let filesCleaned = 0;
let logsRemoved = 0;

function isSafeLog(line) {
  return safePatterns.some(pattern => pattern.test(line));
}

function cleanFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    let removedCount = 0;
    
    const cleanedLines = lines.map(line => {
      // Si es un log seguro, mantenerlo
      if (isSafeLog(line)) {
        return line;
      }
      
      // Verificar si contiene información sensible
      for (const pattern of sensitivePatterns) {
        if (pattern.test(line)) {
          modified = true;
          removedCount++;
          // Mantener la indentación
          const indent = line.match(/^\s*/)[0];
          return `${indent}// 🔒 LOG REMOVIDO POR SEGURIDAD`;
        }
      }
      
      return line;
    });
    
    if (modified) {
      const newContent = cleanedLines.join('\n');
      fs.writeFileSync(filePath, newContent, 'utf8');
      filesCleaned++;
      logsRemoved += removedCount;
      console.log(`✅ ${path.relative(path.join(__dirname, '..'), filePath)} - ${removedCount} logs removidos`);
    }
  } catch (error) {
    console.error(`❌ Error procesando ${filePath}:`, error.message);
  }
}

function scanDirectory(dir, excludeDirs = ['node_modules', '.git', 'dist', 'build', 'scripts']) {
  try {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      // Ignorar archivos/carpetas que empiecen con punto
      if (file.startsWith('.')) return;
      
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        // No entrar en carpetas excluidas
        if (!excludeDirs.includes(file)) {
          scanDirectory(filePath, excludeDirs);
        }
      } else if (file.endsWith('.js')) {
        filesScanned++;
        cleanFile(filePath);
      }
    });
  } catch (error) {
    console.error(`❌ Error escaneando directorio ${dir}:`, error.message);
  }
}

// Función principal
function main() {
  console.log('🔍 Iniciando auditoría de seguridad...\n');
  console.log('📂 Buscando logs sensibles en archivos JavaScript...\n');
  
  const apiDir = path.join(__dirname, '..');
  scanDirectory(apiDir);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN DE LIMPIEZA');
  console.log('='.repeat(60));
  console.log(`📁 Archivos escaneados: ${filesScanned}`);
  console.log(`🧹 Archivos limpiados: ${filesCleaned}`);
  console.log(`🔒 Logs sensibles removidos: ${logsRemoved}`);
  console.log('='.repeat(60));
  
  if (logsRemoved > 0) {
    console.log('\n✅ Limpieza completada exitosamente');
    console.log('⚠️  Revisa los cambios antes de hacer commit\n');
  } else {
    console.log('\n✨ No se encontraron logs sensibles\n');
  }
}

// Ejecutar
main();
