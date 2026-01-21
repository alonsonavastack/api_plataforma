import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock process.env
// Mock process.env
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://agendador:123Alonso123@cluster0.uyzbe.mongodb.net/cursos';

const run = async () => {
    console.log('🚀 Iniciando script de debug de backup...');

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, 'uploads/backups');
        const uploadsDir = path.join(__dirname, 'uploads');
        const dumpPath = path.join(backupDir, `dump-debug-${timestamp}`);
        const zipPath = path.join(backupDir, `backup-debug-${timestamp}.zip`);

        console.log(`📂 Backup Dir: ${backupDir}`);
        console.log(`📂 Uploads Dir: ${uploadsDir}`);

        if (!fs.existsSync(backupDir)) {
            console.log('Creating backup dir...');
            fs.mkdirSync(backupDir, { recursive: true });
        }

        // 1. MONGODUMP
        const mongoUri = process.env.MONGO_URI;
        const mongodumpPath = '/usr/local/bin/mongodump';

        if (!fs.existsSync(mongodumpPath)) {
            throw new Error(`❌ mongodump no encontrado en ${mongodumpPath}`);
        }

        console.log(`🐘 Ejecutando mongodump...`);
        await new Promise((resolve, reject) => {
            const mongodump = spawn(mongodumpPath, [
                `--uri=${mongoUri}`,
                `--out=${dumpPath}`
            ]);

            mongodump.stdout.on('data', d => console.log(`[mongo-out] ${d}`));
            mongodump.stderr.on('data', d => console.log(`[mongo-err] ${d}`));
            mongodump.on('error', reject);
            mongodump.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(`mongodump exited with code ${code}`));
            });
        });
        console.log('✅ Mongodump finalizado.');

        // 2. ZIP
        console.log('📦 Iniciando compresión ZIP...');
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => console.log('✅ ZIP finalizado y guardado en:', zipPath));
        archive.on('error', err => { throw err; });

        archive.pipe(output);

        // Append paths
        console.log('   - Agregando dump...');
        archive.directory(dumpPath, 'dump');

        console.log('   - Agregando uploads...');
        // Simplificado para debug: solo agregar un archivo dummy o el directorio real si existe
        if (fs.existsSync(uploadsDir)) {
            archive.directory(uploadsDir, 'uploads', (entry) => {
                if (entry.name.startsWith('backups')) return false;
                return entry;
            });
        } else {
            console.warn('⚠️ No se encontró directorio uploads para agregar.');
        }

        await archive.finalize();
        console.log('🎉 PROCESO COMPLETADO EXITOSAMENTE');

    } catch (error) {
        console.error('❌ FATAL ERROR:', error);
    }
};

run();
