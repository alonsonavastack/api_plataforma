import mongoose, { Schema } from "mongoose";

const PaymentSettingsSchema = Schema({
    paypal: {
        clientId: { type: String, default: '' },
        clientSecret: { type: String, default: '' },
        mode: { type: String, default: 'sandbox' },
        active: { type: Boolean, default: false },
        instructorPayoutsActive: { type: Boolean, default: false } // 🆕 Switch para pagos a instructores
    },
    mercadopago: {
        publicKey: { type: String, default: '' },
        accessToken: { type: String, default: '' },
        active: { type: Boolean, default: false },
        instructorPayoutsActive: { type: Boolean, default: false } // 🆕 Switch para pagos a instructores
    },
    updatedBy: {
        type: Schema.ObjectId,
        ref: 'user'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

PaymentSettingsSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const PaymentSettings = mongoose.model('payment_settings', PaymentSettingsSchema);
export default PaymentSettings;
