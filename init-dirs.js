
import fs from 'fs';
import path from 'path';

// Necesitamos __dirname para manejar las rutas de archivos
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const initDirectories = () => {
    const uploadBase = path.join(__dirname, 'uploads');

    // Lista de carpetas requeridas según los routers inspeccionados
    const directories = [
        'user',           // User.js
        'course',         // Course.js
        'categorie',      // Categorie.js
        'project',        // Project.js
        'project-files',  // Project.js
        'system'          // SystemConfig.js
    ];

    console.log('📂 [Init] Verificando estructura de directorios...');

    // Asegurar que existe la carpeta base uploads
    if (!fs.existsSync(uploadBase)) {
        console.log(`   ➕ Creando carpeta base: ${uploadBase}`);
        fs.mkdirSync(uploadBase, { recursive: true });
    }

    // Crear subdirectorios
    directories.forEach(dir => {
        const fullPath = path.join(uploadBase, dir);
        if (!fs.existsSync(fullPath)) {
            console.log(`   ➕ Creando directorio: uploads/${dir}`);
            fs.mkdirSync(fullPath, { recursive: true });
        } else {
            // console.log(`   ✅ Existe directorio: uploads/${dir}`);
        }
    });

    console.log('✅ [Init] Estructura de directorios verificada.');
};
