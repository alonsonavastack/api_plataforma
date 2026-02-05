import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import os from 'os';
import { fileURLToPath } from 'url';
import { getIO } from '../services/socket.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const download = async (req, res) => {
    console.log('📦 [BackupController] REQUEST RECEIVED: /backup/download');
    console.log(`📂 [Debug] CWD: ${process.cwd()}`);

    // Configuración de rutas usando process.cwd() para mayor seguridad
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // 🔥 FIX: Usar directorio temporal del SISTEMA para evitar que nodemon se reinicie al crear archivos
    const backupDir = path.join(os.tmpdir(), 'courses-lms-backups');
    const uploadsDir = path.join(process.cwd(), 'uploads');

    const dumpFolderName = `dump-${timestamp}`;
    const dumpPath = path.join(backupDir, dumpFolderName);
    const zipFilename = `backup-${timestamp}.zip`;
    const zipPath = path.join(backupDir, zipFilename);

    try {
        // 1. Crear directorio temporal
        if (!fs.existsSync(backupDir)) {
            console.log(`📂 Creando directorio temporal: ${backupDir}`);
            fs.mkdirSync(backupDir, { recursive: true });
        }

        // 2. MONGODUMP
        // Fallback al URI conocido si no hay variable de entorno
        const mongoUri = process.env.MONGO_URI || 'mongodb+srv://agendador:123Alonso123@cluster0.uyzbe.mongodb.net/cursos';

        // 🔥 FIX MEJORADO: Buscar mongodump en múltiples ubicaciones comunes
        let mongodumpPath = null;

        // Lista de rutas posibles donde puede estar mongodump
        const possiblePaths = [
            process.env.MONGODUMP_PATH,                 // 1. Variable de entorno (prioridad máxima)
            '/usr/bin/mongodump',                       // 2. Estándar Linux
            '/usr/local/bin/mongodump',                 // 3. Estándar MacOS / Linux manual
            '/snap/bin/mongodump',                      // 4. Ubuntu Snap
            '/opt/mongodb-database-tools/bin/mongodump' // 5. Instalación manual Tools
        ];

        // Verificar cuál existe
        for (const p of possiblePaths) {
            if (p && fs.existsSync(p)) {
                mongodumpPath = p;
                break;
            }
        }

        // Si no se encontró en rutas absolutas, intentar 'mongodump' del PATH como último recurso
        if (!mongodumpPath) {
            mongodumpPath = 'mongodump';
        }

        console.log(`⏳ [BackupController] Ejecutando mongodump usando: ${mongodumpPath}`);

        await new Promise((resolve, reject) => {
            const mongodump = spawn(mongodumpPath, [
                `--uri=${mongoUri}`,
                `--out=${dumpPath}`
            ]);

            mongodump.on('error', (err) => {
                let msg = `Error al ejecutar mongodump: ${err.message}`;
                if (err.code === 'ENOENT') {
                    msg = `❌ Error Crítico: No se encontró la herramienta 'mongodump' en el servidor. 
                    Por favor instala 'mongodb-database-tools' o configura la variable MONGODUMP_PATH.
                    Ruta intentada: ${mongodumpPath}`;
                }
                console.error(msg);
                reject(new Error(msg));
            });

            mongodump.stderr.on('data', (data) => console.log(`[mongodump] ${data}`));

            mongodump.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`mongodump falló con código de salida ${code}. Revisa los logs del servidor.`));
            });
        });

        // 3. COMPRESIÓN ZIP
        console.log('⏳ [BackupController] Comprimiendo a archivo local...');

        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                console.log(`✅ ZIP local creado: ${archive.pointer()} bytes`);
                resolve();
            });

            archive.on('error', (err) => reject(err));
            archive.pipe(output);

            // A) Agregar el Dump (DB)
            archive.directory(dumpPath, 'dump');

            // B) Agregar Uploads (Archivos)
            if (fs.existsSync(uploadsDir)) {
                // Ya no hay riesgo de recursión porque backupDir está en /tmp
                archive.directory(uploadsDir, 'uploads', (entry) => {
                    // Excluir backups antiguos si existen en la carpeta de origen
                    if (entry.name.includes('backups') || entry.name.includes('temp_dl_backup')) return false;
                    return entry;
                });
            }

            archive.finalize();
        });

        // 4. DOWNLOAD
        console.log('✅ [BackupController] Enviando archivo al cliente...');

        res.download(zipPath, zipFilename, (err) => {
            if (err) {
                console.error('❌ Error enviando archivo (cliente canceló?):', err);
            }
            // Limpieza siempre después del envío
            cleanup(dumpPath, zipPath);
            // Intentar borrar carpeta temp si está vacía
            try {
                if (fs.existsSync(backupDir)) {
                    // fs.rmdirSync(backupDir); // Opcional, puede fallar si no está vacía
                }
            } catch (e) { }
        });

    } catch (error) {
        console.error('❌ [BackupController] FATAL ERROR:', error);
        if (!res.headersSent) {
            res.status(500).send({ message: 'Error interno al generar respaldo', error: error.message });
        }
        cleanup(dumpPath, zipPath);
    }
};

const restore = async (req, res) => {
    console.log('📦 [BackupController] REQUEST RECEIVED: /backup/restore');
    console.log('📦 [BackupController] Iniciando restauración de respaldo...');

    // Helper para emitir progreso
    const emitProgress = (percentage, message) => {
        try {
            const io = getIO();
            // Emitir a todos los admins conectados (o a todos por ahora para asegurar que llegue)
            io.emit('restore_progress', { percentage, message });
            console.log(`📡 [Socket] Progreso restauracion: ${percentage}% - ${message}`);
        } catch (e) {
            console.warn('⚠️ No se pudo emitir progreso por socket:', e.message);
        }
    };

    if (!req.files || !req.files.file) {
        return res.status(400).send({ message: 'No se ha subido ningún archivo.' });
    }

    emitProgress(0, 'Iniciando proceso de restauración...');

    const zipFile = req.files.file;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // 🔥 FIX: Usar directorio temporal del sistema para evitar reinicios de nodemon durante la extracción
    const restoreDir = path.join(os.tmpdir(), 'courses-lms-restore-' + timestamp);
    const targetUploadsDir = path.join(process.cwd(), 'uploads');

    try {
        // 1. Descomprimir el archivo
        emitProgress(10, 'Descomprimiendo archivo de respaldo...');
        console.log(`⏳ [BackupController] Descomprimiendo archivo ${zipFile.path} en ${restoreDir}...`);

        if (!fs.existsSync(restoreDir)) {
            fs.mkdirSync(restoreDir, { recursive: true });
        }

        const zip = new AdmZip(zipFile.path);
        zip.extractAllTo(restoreDir, true);

        // 2. Restaurar Base de Datos (MongoRestore)
        emitProgress(25, 'Analizando estructura del respaldo...');
        console.log('⏳ [BackupController] Buscando dump de base de datos...');

        // Helper para encontrar carpeta con archivos .bson
        const findBsonDir = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.lstatSync(fullPath);
                if (stat.isDirectory()) {
                    const found = findBsonDir(fullPath);
                    if (found) return found;
                } else if (file.endsWith('.bson')) {
                    return dir; // Retornar el directorio que contiene el .bson
                }
            }
            return null;
        };

        const bsonDir = findBsonDir(restoreDir);

        if (!bsonDir) {
            console.warn('⚠️ [BackupController] No se encontraron archivos .bson en el respaldo. Saltando restauración de DB.');
            emitProgress(30, 'No se encontró base de datos para restaurar.');
        } else {
            console.log(`🎯 [BackupController] Archivos BSON encontrados en: ${bsonDir}`);
            emitProgress(35, 'Restaurando base de datos (esto puede tardar)...');

            const mongoUri = process.env.MONGO_URI || 'mongodb+srv://agendador:123Alonso123@cluster0.uyzbe.mongodb.net/cursos';

            // Extraer nombre de la BD del URI o usar 'cursos' por defecto
            let targetDbName = 'cursos';
            try {
                const urlParts = new URL(mongoUri.startsWith('mongodb') ? mongoUri : 'mongodb://' + mongoUri);
                if (urlParts.pathname && urlParts.pathname.length > 1) {
                    targetDbName = urlParts.pathname.substring(1);
                }
            } catch (e) { console.error('Error parseando URI:', e); }

            console.log(`🎯 [BackupController] Restaurando en base de datos: ${targetDbName}`);

            // 🔥 FIX MEJORADO: Buscar mongorestore en múltiples ubicaciones comunes
            let mongorestorePath = null;

            // Lista de rutas posibles
            const possiblePaths = [
                process.env.MONGORESTORE_PATH,              // 1. Variable de entorno
                '/usr/bin/mongorestore',                    // 2. Estándar Linux
                '/usr/local/bin/mongorestore',              // 3. Estándar MacOS / Linux manual
                '/snap/bin/mongorestore',                   // 4. Ubuntu Snap
                '/opt/mongodb-database-tools/bin/mongorestore' // 5. Instalación manual Tools
            ];

            // Verificar cuál existe
            for (const p of possiblePaths) {
                if (p && fs.existsSync(p)) {
                    mongorestorePath = p;
                    break;
                }
            }

            // Fallback a PATH
            if (!mongorestorePath) {
                mongorestorePath = 'mongorestore';
            }

            console.log(`⏳ [BackupController] Ejecutando mongorestore usando: ${mongorestorePath}`);

            await new Promise((resolve, reject) => {
                const mongorestore = spawn(mongorestorePath, [
                    `--uri=${mongoUri}`,
                    `--db=${targetDbName}`, // 🔥 FORZAR base de datos destino
                    `--dir=${bsonDir}`,     // 🔥 Apuntar DIRECTO a los archivos bson
                    `--drop`                // Borrar colecciones existentes antes de restaurar
                ]);

                mongorestore.on('error', (err) => {
                    let msg = `Error al ejecutar mongorestore: ${err.message}`;
                    if (err.code === 'ENOENT') {
                        msg = `❌ Error Crítico: No se encontró la herramienta 'mongorestore'. 
                         Instala 'mongodb-database-tools' o configura MONGORESTORE_PATH.
                         Ruta intentada: ${mongorestorePath}`;
                    }
                    console.error(msg);
                    reject(new Error(msg));
                });

                mongorestore.stderr.on('data', (data) => console.log(`[mongorestore] ${data}`));

                mongorestore.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`mongorestore falló con código ${code}`));
                });
            });
            console.log('✅ [BackupController] Base de datos restaurada.');
            emitProgress(70, 'Base de datos restaurada correctamente.');
        }

        // 3. Restaurar Archivos
        emitProgress(75, 'Restaurando archivos multimedia...');
        // Buscar carpeta 'uploads'
        let uploadedSourceDir = path.join(restoreDir, 'uploads');
        // Si no está en la raíz, buscar en subcarpeta wrapper si existe
        if (!fs.existsSync(uploadedSourceDir)) {
            const items = fs.readdirSync(restoreDir).filter(item => fs.lstatSync(path.join(restoreDir, item)).isDirectory());
            if (items.length === 1) {
                uploadedSourceDir = path.join(restoreDir, items[0], 'uploads');
            }
        }

        if (fs.existsSync(uploadedSourceDir)) {
            console.log(`⏳ [BackupController] Restaurando archivos estáticos desde ${uploadedSourceDir}...`);
            await new Promise((resolve, reject) => {
                // Usar 'cp -R' para copiar y sobreescribir recursivamente
                // El '/.' al final de source es importante para copiar el CONTENIDO, no la carpeta en sí
                const cp = spawn('cp', ['-R', path.join(uploadedSourceDir, '/') + '.', targetUploadsDir]);

                cp.on('error', (err) => reject(new Error(`Error copiando archivos: ${err.message}`)));

                cp.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`cp exited with code ${code}`));
                });
            });
            console.log('✅ [BackupController] Archivos restaurados.');
            emitProgress(90, 'Archivos restaurados.');
        } else {
            console.log('⚠️ [BackupController] No se encontró carpeta uploads en el respaldo, omitiendo restauración de archivos.');
        }

        emitProgress(100, 'Restauración completada exitosamente.');
        console.log('✅ [BackupController] Restauración completada exitosamente.');
        res.status(200).send({ message: 'Base de datos y archivos restaurados correctamente.' });

    } catch (error) {
        console.error('❌ [BackupController] Error en restauración:', error);
        emitProgress(0, 'Error: ' + error.message);
        res.status(500).send({ message: 'Error al restaurar el respaldo', error: error.message });
    } finally {
        cleanupRestore(restoreDir, zipFile);
    }
};

const test = async (req, res) => {
    try {
        console.log('🧪 Testing Archiver...');
        res.attachment('test.zip');
        const archive = archiver('zip');
        archive.pipe(res);
        archive.append('Hello World', { name: 'hello.txt' });
        await archive.finalize();
        console.log('✅ Test ZIP sent.');
    } catch (e) {
        console.error('❌ Test failed:', e);
        res.status(500).send(e.message);
    }
};

// Helpers de limpieza
const cleanup = (dumpPath, zipPath) => {
    console.log('🧹 [BackupController] Ejecutando limpieza...');
    try {
        if (fs.existsSync(dumpPath)) fs.rmSync(dumpPath, { recursive: true, force: true });
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    } catch (e) {
        console.error('⚠️ Error limpiando:', e);
    }
};

const cleanupRestore = (restoreDir, zipFile) => {
    try {
        if (fs.existsSync(restoreDir)) fs.rmSync(restoreDir, { recursive: true, force: true });
        if (zipFile.path && fs.existsSync(zipFile.path)) fs.unlinkSync(zipFile.path);
    } catch (e) {
        console.error('⚠️ Error limpiando restore:', e);
    }
};

export { download, restore, test };
