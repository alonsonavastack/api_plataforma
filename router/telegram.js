import routerx from 'express-promise-router';
import TelegramController from '../controllers/TelegramController.js';
const router = routerx();

// POST /api/telegram/webhook  <-- configurar webhook del bot aquí
router.post('/webhook', TelegramController.webhook);

export default router;
