import mongoose from 'mongoose';
const { Schema } = mongoose;

const WalletTransactionSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    }, // credit = +, debit = -
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    description: { type: String },
    metadata: {
        refundId: { type: Schema.Types.ObjectId, ref: 'Refund' },
        orderId: { type: String }, // 🔥 Cambiado a String para soportar n_transaccion
        reason: { type: String }
    }
}, {
    timestamps: true
});

const WalletSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    currency: {
        type: String,
        default: 'USD'
    },
    transactions: [WalletTransactionSchema],
    state: {
        type: Number,
        default: 1 // 1 = activa, 0 = inactiva
    }
}, {
    timestamps: true
});

// Método para agregar crédito (reembolso, bono, etc.)
WalletSchema.methods.addCredit = async function (amount, description, metadata = {}) {
    // 🔒 SAFEGUARD: Evitar doble acreditación por el mismo reembolso
    try {
        if (metadata && metadata.refundId) {
            const existing = this.transactions.find(t =>
                t.type === 'credit' &&
                t.metadata &&
                t.metadata.refundId &&
                t.metadata.refundId.toString() === metadata.refundId.toString() &&
                t.amount === amount &&
                t.metadata.reason === (metadata.reason || 'refund')
            );

            if (existing) {
                console.warn(`⚠️ [Wallet] Intento de doble crédito detectado para refundId=${metadata.refundId}, amount=${amount}. Operación ignorada.`);
                return existing; // Devolver transacción existente en lugar de duplicar
            }
        }

        this.balance += amount;

        const transaction = {
            user: this.user,
            type: 'credit',
            amount: amount,
            balanceAfter: this.balance,
            description: description,
            metadata: metadata
        };

        this.transactions.push(transaction);
        await this.save();

        // 🔥 OBTENER LA TRANSACCIÓN CON SU _id GENERADO POR MONGODB
        const savedTransaction = this.transactions[this.transactions.length - 1];

        console.log(`💰 [Wallet] Crédito agregado: +${amount} USD. Nuevo balance: ${this.balance}`);
        console.log(`🆔 [Wallet] Transaction ID generado: ${savedTransaction._id}`);

        return savedTransaction;
    } catch (err) {
        console.error('❌ [Wallet.addCredit] Error en safeguard o guardado:', err);
        throw err;
    }
};

// Método para debitar (compra con saldo de billetera)
WalletSchema.methods.addDebit = async function (amount, description, metadata = {}) {
    if (this.balance < amount) {
        throw new Error('Saldo insuficiente en la billetera');
    }

    this.balance -= amount;

    const transaction = {
        user: this.user,
        type: 'debit',
        amount: amount,
        balanceAfter: this.balance,
        description: description,
        metadata: metadata
    };

    this.transactions.push(transaction);
    await this.save();

    // 🔥 OBTENER LA TRANSACCIÓN CON SU _id GENERADO POR MONGODB
    const savedTransaction = this.transactions[this.transactions.length - 1];

    console.log(`💳 [Wallet] Débito realizado: -${amount} USD. Nuevo balance: ${this.balance}`);
    console.log(`🆔 [Wallet] Transaction ID generado: ${savedTransaction._id}`);

    return savedTransaction;
};

// Método estático para obtener o crear wallet
WalletSchema.statics.getOrCreateWallet = async function (userId) {
    let wallet = await this.findOne({ user: userId });

    if (!wallet) {
        wallet = await this.create({
            user: userId,
            balance: 0,
            currency: 'USD',
            transactions: []
        });
        console.log(`🆕 [Wallet] Nueva billetera creada para usuario: ${userId}`);
    }

    return wallet;
};

export default mongoose.model('Wallet', WalletSchema);
