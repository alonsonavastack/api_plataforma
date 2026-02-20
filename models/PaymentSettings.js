import mongoose, { Schema } from "mongoose";

const PaymentSettingsSchema = Schema({
    stripe: {
        mode: { type: String, default: 'test' },
        active: { type: Boolean, default: true },
        secretKey: { type: String, default: '' },
        publishableKey: { type: String, default: '' },
        webhookSecret: { type: String, default: '' }
    },
    updatedBy: {
        type: Schema.ObjectId,
        ref: 'user'
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

PaymentSettingsSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const PaymentSettings = mongoose.model('payment_settings', PaymentSettingsSchema);
export default PaymentSettings;
