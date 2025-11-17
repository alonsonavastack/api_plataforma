import express from 'express';
import * as WalletController from '../controllers/WalletController.js';
import auth from '../service/auth.js';

const router = express.Router();

/**
 * 💰 Rutas de Billetera Digital
 */

// Obtener mi billetera (cliente)
router.get('/my-wallet', auth.verifyToken, WalletController.getMyWallet);

// Obtener solo el balance
router.get('/balance', auth.verifyToken, WalletController.getBalance);

// Agregar crédito manualmente (solo admin)
router.post('/add-credit', auth.verifyAdmin, WalletController.addCredit);

// Obtener todas las billeteras (solo admin)
router.get('/admin/all-wallets', auth.verifyAdmin, WalletController.getAllWallets);

// Obtener billetera de un usuario específico (solo admin)
router.get('/admin/user-wallet/:userId', auth.verifyAdmin, WalletController.getUserWallet);

export default router;
