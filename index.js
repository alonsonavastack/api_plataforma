import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url';
import mongoose from 'mongoose'
import router from './router/index.js';
import { createServer } from 'http';
import { initializeSocketIO } from './services/socket.service.js';

// CONEXION A LA BASE DE DATOS
mongoose.Promise = global.Promise
const dbUrl = process.env.MONGO_URI;
mongoose.connect(
    dbUrl, {
        useNewUrlParser: true,
        useUnifiedTopology:true,
    }
).then(async mongoose => {
    console.log("Conectado a la base de datos MongoDB.");
    
    // Intentar inicializar CRON jobs (solo si node-cron está instalado)
    try {
        const { initializeCronJobs } = await import('./cron/index.js');
        initializeCronJobs();
    } catch (error) {
        console.log('\n⚠️  CRON jobs no inicializados (instala node-cron con: npm install node-cron)');
        console.log('   El sistema funcionará normalmente sin CRON jobs automáticos.\n');
    }
})
.catch(err => console.log(err));

const app = express();
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({extended: true}))
app.use(express.static(path.join(__dirname,'public')))
app.use('/api/',router)

// Custom error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ message: 'An internal server error occurred.', error: err.message });
});

app.set('port', process.env.PUERTO || 3000);

// Crear servidor HTTP
const httpServer = createServer(app);

// Inicializar Socket.IO
initializeSocketIO(httpServer);

// Iniciar servidor
const server = httpServer.listen(app.get('port'), () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${app.get('port')}`);
    console.log(`🔌 WebSocket disponible en ws://localhost:${app.get('port')}`);
});

// Manejo de cierre graceful del servidor
process.on('SIGTERM', async () => {
    console.log('\n⚠️  SIGTERM recibido. Cerrando servidor...');
    try {
        const { stopAllCronJobs } = await import('./cron/index.js');
        stopAllCronJobs();
    } catch (error) {
        // CRON jobs no están disponibles
    }
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente.');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('\n⚠️  SIGINT recibido (Ctrl+C). Cerrando servidor...');
    try {
        const { stopAllCronJobs } = await import('./cron/index.js');
        stopAllCronJobs();
    } catch (error) {
        // CRON jobs no están disponibles
    }
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente.');
        process.exit(0);
    });
});
