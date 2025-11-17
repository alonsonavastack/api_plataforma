import models from '../models/index.js';

/**
 * 💰 Obtener billetera del usuario actual
 */
export async function getMyWallet(req, res) {
    try {
        const user = req.user;
        const userObj = user.toObject ? user.toObject() : user;
        
        // Obtener o crear billetera
        const wallet = await models.Wallet.getOrCreateWallet(userObj._id);
        
        res.status(200).send({
            balance: wallet.balance,
            currency: wallet.currency,
            transactions: wallet.transactions.sort((a, b) => 
                new Date(b.createdAt) - new Date(a.createdAt)
            )
        });
    } catch (error) {
        console.error('❌ [WalletController.getMyWallet] Error:', error);
        res.status(500).send({ 
            message: 'Error al obtener billetera',
            error: error.message 
        });
    }
}

/**
 * 💵 Obtener solo el balance actual
 */
export async function getBalance(req, res) {
    try {
        const user = req.user;
        const userObj = user.toObject ? user.toObject() : user;
        
        const wallet = await models.Wallet.getOrCreateWallet(userObj._id);
        
        res.status(200).send({
            balance: wallet.balance,
            currency: wallet.currency
        });
    } catch (error) {
        console.error('❌ [WalletController.getBalance] Error:', error);
        res.status(500).send({ 
            message: 'Error al obtener balance',
            error: error.message 
        });
    }
}

/**
 * ➕ Agregar crédito manualmente (Solo Admin)
 */
export async function addCredit(req, res) {
    try {
        const { userId, amount, description } = req.body;
        
        if (!userId || !amount || amount <= 0) {
            return res.status(400).send({ 
                message: 'userId y amount (mayor a 0) son requeridos' 
            });
        }
        
        const wallet = await models.Wallet.getOrCreateWallet(userId);
        
        const transaction = await wallet.addCredit(
            amount, 
            description || 'Crédito manual por administrador',
            { reason: 'manual_credit' }
        );
        
        res.status(200).send({
            message: 'Crédito agregado exitosamente',
            transaction,
            newBalance: wallet.balance
        });
    } catch (error) {
        console.error('❌ [WalletController.addCredit] Error:', error);
        res.status(500).send({ 
            message: 'Error al agregar crédito',
            error: error.message 
        });
    }
}

/**
 * ➖ Usar saldo de billetera para una compra (interno)
 * Esta función será llamada desde el checkout cuando el usuario elija pagar con billetera
 */
export async function useWalletBalance(userId, amount, saleId, description) {
    try {
        const wallet = await models.Wallet.getOrCreateWallet(userId);
        
        if (wallet.balance < amount) {
            throw new Error(`Saldo insuficiente. Disponible: $${wallet.balance}, Requerido: $${amount}`);
        }
        
        const transaction = await wallet.addDebit(
            amount,
            description || 'Compra con saldo de billetera',
            { 
                orderId: saleId,
                reason: 'purchase'
            }
        );
        
        console.log(`✅ [WalletController] Compra realizada con billetera: -$${amount} USD`);
        
        return {
            success: true,
            transaction,
            newBalance: wallet.balance
        };
    } catch (error) {
        console.error('❌ [WalletController.useWalletBalance] Error:', error);
        throw error;
    }
}

/**
 * 💰 Acreditar reembolso a billetera (interno)
 * Esta función será llamada automáticamente cuando se apruebe un reembolso
 */
export async function creditRefund(userId, amount, refundId, description) {
    try {
        const wallet = await models.Wallet.getOrCreateWallet(userId);
        
        const transaction = await wallet.addCredit(
            amount,
            description || 'Reembolso acreditado',
            { 
                refundId: refundId,
                reason: 'refund'
            }
        );
        
        console.log(`✅ [WalletController] Reembolso acreditado: +${amount} USD para usuario ${userId}`);
        
        return {
            success: true,
            transaction,
            newBalance: wallet.balance
        };
    } catch (error) {
        console.error('❌ [WalletController.creditRefund] Error:', error);
        throw error;
    }
}

/**
 * 👑 Obtener todas las billeteras de CLIENTES (Solo Admin)
 * ⚠️ IMPORTANTE: Solo muestra billeteras de usuarios con rol 'cliente' (customer)
 */
export async function getAllWallets(req, res) {
    try {
        console.log('💰 [getAllWallets] Iniciando carga de billeteras...');
        
        // 🔥 PASO 1: Obtener todos los usuarios CLIENTES (rol: 'cliente' o 'customer')
        // ✅ FIX: Buscar ambos valores para compatibilidad
        const customers = await models.User.find({ 
            rol: { $in: ['cliente', 'customer'] },  // ✅ ACEPTA AMBOS
            state: true 
        }).select('_id name surname email rol');
        
        console.log(`👥 [getAllWallets] Clientes encontrados: ${customers.length}`);
        
        if (customers.length === 0) {
            console.log('⚠️ [getAllWallets] No se encontraron clientes activos');
            return res.status(200).send([]);
        }
        
        // 🔥 PASO 2: Obtener billeteras de esos usuarios
        const customerIds = customers.map(c => c._id);
        const wallets = await models.Wallet.find({ 
            user: { $in: customerIds },
            state: 1 
        }).sort({ balance: -1 });
        
        console.log(`💰 [getAllWallets] Billeteras encontradas: ${wallets.length}`);
        
        // 🔥 PASO 3: Crear mapa de usuarios para acceso rápido
        const userMap = new Map();
        customers.forEach(customer => {
            userMap.set(customer._id.toString(), customer);
        });
        
        // 🔥 PASO 4: Crear billeteras faltantes y mapear respuesta
        const walletsResponse = [];
        
        for (const customer of customers) {
            let wallet = wallets.find(w => w.user.toString() === customer._id.toString());
            
            // Si no existe billetera, crearla
            if (!wallet) {
                console.log(`🆕 [getAllWallets] Creando billetera para: ${customer.name} ${customer.surname}`);
                wallet = await models.Wallet.create({
                    user: customer._id,
                    balance: 0,
                    currency: 'USD',
                    transactions: []
                });
            }
            
            // Mapear respuesta con datos del usuario
            walletsResponse.push({
                _id: wallet._id,
                user: {
                    _id: customer._id,
                    name: customer.name,
                    surname: customer.surname,
                    email: customer.email,
                    rol: customer.rol
                },
                balance: wallet.balance,
                currency: wallet.currency,
                transactions: wallet.transactions,
                state: wallet.state,
                createdAt: wallet.createdAt,
                updatedAt: wallet.updatedAt
            });
        }
        
        console.log(`✅ [getAllWallets] Billeteras de clientes cargadas: ${walletsResponse.length}`);
        console.log(`📊 [getAllWallets] Balance total: $${walletsResponse.reduce((sum, w) => sum + w.balance, 0).toFixed(2)}`);
        
        res.status(200).send(walletsResponse);
    } catch (error) {
        console.error('❌ [WalletController.getAllWallets] Error:', error);
        res.status(500).send({ 
            message: 'Error al obtener billeteras',
            error: error.message 
        });
    }
}

/**
 * 👑 Obtener billetera de un usuario específico (Solo Admin)
 */
export async function getUserWallet(req, res) {
    try {
        const { userId } = req.params;
        
        const wallet = await models.Wallet.getOrCreateWallet(userId);
        
        res.status(200).send({
            balance: wallet.balance,
            currency: wallet.currency,
            transactions: wallet.transactions.sort((a, b) => 
                new Date(b.createdAt) - new Date(a.createdAt)
            )
        });
    } catch (error) {
        console.error('❌ [WalletController.getUserWallet] Error:', error);
        res.status(500).send({ 
            message: 'Error al obtener billetera del usuario',
            error: error.message 
        });
    }
}
