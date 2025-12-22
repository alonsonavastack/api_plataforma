// router/health.js
import routerx from 'express-promise-router';
import mongoose from 'mongoose';

const router = routerx();

/**
 * 🏥 HEALTH CHECK ENDPOINT
 * 
 * Endpoint para verificar el estado del servidor y sus dependencias.
 * Útil para:
 * - Monitoreo con servicios como UptimeRobot, Pingdom, New Relic
 * - Load balancers que necesitan verificar si el servidor está vivo
 * - Debugging rápido de conexiones
 * 
 * Respuestas:
 * - 200: Todo funciona correctamente
 * - 503: Algún servicio crítico no funciona
 */
router.get('/health', async (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    checks: {
      database: 'unknown',
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
        percentage: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100)
      },
      cpu: {
        usage: process.cpuUsage()
      }
    }
  };

  try {
    // Verificar conexión a MongoDB
    const dbState = mongoose.connection.readyState;
    
    switch (dbState) {
      case 0:
        healthcheck.checks.database = 'disconnected';
        healthcheck.message = 'DEGRADED';
        break;
      case 1:
        healthcheck.checks.database = 'connected';
        // Hacer un ping rápido a la BD para confirmar que responde
        await mongoose.connection.db.admin().ping();
        healthcheck.checks.database = 'connected and responding';
        break;
      case 2:
        healthcheck.checks.database = 'connecting';
        healthcheck.message = 'DEGRADED';
        break;
      case 3:
        healthcheck.checks.database = 'disconnecting';
        healthcheck.message = 'DEGRADED';
        break;
      default:
        healthcheck.checks.database = 'unknown';
        healthcheck.message = 'DEGRADED';
    }

    // Verificar uso de memoria crítico (> 90%)
    if (healthcheck.checks.memory.percentage > 90) {
      healthcheck.message = 'DEGRADED';
      healthcheck.checks.memory.warning = 'High memory usage';
    }

    const statusCode = healthcheck.message === 'OK' ? 200 : 503;
    res.status(statusCode).json(healthcheck);

  } catch (error) {
    healthcheck.message = 'ERROR';
    healthcheck.checks.database = 'error';
    healthcheck.error = error.message;
    res.status(503).json(healthcheck);
  }
});

/**
 * 🔍 READINESS CHECK
 * 
 * Similar al health check pero específicamente para Kubernetes/Docker
 * Indica si el servidor está listo para recibir tráfico
 */
router.get('/ready', async (req, res) => {
  try {
    // Verificar que MongoDB esté conectado
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ ready: false, reason: 'Database not connected' });
    }

    // Ping a la BD
    await mongoose.connection.db.admin().ping();

    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, reason: error.message });
  }
});

/**
 * 💓 LIVENESS CHECK
 * 
 * Verifica que el proceso esté vivo (no bloqueado ni en deadlock)
 * Kubernetes usa esto para decidir si reiniciar el container
 */
router.get('/live', (req, res) => {
  res.status(200).json({ alive: true });
});

export default router;
