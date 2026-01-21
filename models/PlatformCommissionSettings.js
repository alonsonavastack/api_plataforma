import mongoose, { Schema } from "mongoose";

const PlatformCommissionSettingsSchema = new Schema({
    // COMISIÓN POR DEFECTO
    default_commission_rate: {
        type: Number, // Porcentaje (ej: 30 = 30%)
        required: true,
        default: 30,
        min: 0,
        min: 0,
        max: 100
    },

    // COMISIÓN POR REFERIDO (CUPÓN DE INSTRUCTOR)
    referral_commission_rate: {
        type: Number, // Porcentaje (ej: 20 = 20% para plataforma, 80% instructor)
        required: true,
        default: 20,
        min: 0,
        max: 100
    },

    // COMISIÓN PERSONALIZADA POR INSTRUCTOR
    instructor_custom_rates: [{
        instructor: {
            type: Schema.ObjectId,
            ref: 'user',
            required: true
        },
        commission_rate: {
            type: Number, // Porcentaje personalizado
            required: true,
            min: 0,
            max: 100
        },
        reason: {
            type: String,
            maxlength: 500,
            required: false
        },
        effective_from: {
            type: Date,
            default: Date.now
        },
        created_by: {
            type: Schema.ObjectId,
            ref: 'user', // Admin que configuró esta comisión
            required: false
        }
    }],

    // DÍAS HASTA QUE LA GANANCIA ESTÉ DISPONIBLE
    days_until_available: {
        type: Number,
        default: 7, // Por defecto 7 días para reembolsos
        min: 0,
        max: 90
    },

    // MONTO MÍNIMO PARA PAGO
    minimum_payment_threshold: {
        type: Number,
        default: 50, // Mínimo $50 USD para procesar pago
        min: 0
    },

    // CONFIGURACIÓN DE MONEDA
    default_currency: {
        type: String,
        default: 'USD',
        enum: ['USD', 'MXN']
    },

    // TIPO DE CAMBIO (si se manejan ambas monedas)
    exchange_rate_usd_to_mxn: {
        type: Number,
        default: 17.5, // Actualizar manualmente o con API
        required: false
    },

    // MÉTODOS DE PAGO HABILITADOS
    enabled_payment_methods: {
        paypal: {
            type: Boolean,
            default: true
        },
        bank_transfer: {
            type: Boolean,
            default: true
        },
        other: {
            type: Boolean,
            default: false
        }
    },

    // NOTIFICACIONES
    notifications: {
        notify_instructor_on_new_earning: {
            type: Boolean,
            default: true
        },
        notify_instructor_on_available: {
            type: Boolean,
            default: true
        },
        notify_instructor_on_payment: {
            type: Boolean,
            default: true
        },
        notify_admin_on_threshold: {
            type: Boolean,
            default: true
        }
    },

    // ÚLTIMA ACTUALIZACIÓN
    last_updated_by: {
        type: Schema.ObjectId,
        ref: 'user',
        required: false
    }
}, {
    timestamps: true
});

// Solo debe haber UN documento de configuración
// Usamos este método estático para obtener o crear la configuración
PlatformCommissionSettingsSchema.statics.getSettings = async function () {
    let settings = await this.findOne();

    if (!settings) {
        // Si no existe, crear configuración por defecto
        settings = await this.create({
            default_commission_rate: 30,
            days_until_available: 7,
            minimum_payment_threshold: 50,
            default_currency: 'USD',
            default_currency: 'USD',
            exchange_rate_usd_to_mxn: 17.5,
            referral_commission_rate: 20
        });
    }

    return settings;
};

// Método para obtener la comisión de un instructor específico
PlatformCommissionSettingsSchema.statics.getInstructorCommissionRate = async function (instructorId) {
    const settings = await this.getSettings();

    // Buscar si hay una comisión personalizada para este instructor
    const customRate = settings.instructor_custom_rates.find(
        rate => rate.instructor.toString() === instructorId.toString()
    );

    if (customRate) {
        return customRate.commission_rate;
    }

    // Si no hay comisión personalizada, devolver la por defecto
    return settings.default_commission_rate;
};

// Método para agregar o actualizar comisión personalizada
PlatformCommissionSettingsSchema.statics.setCustomCommission = async function (instructorId, commissionRate, reason, adminId) {
    const settings = await this.getSettings();

    // Buscar si ya existe una comisión personalizada para este instructor
    const existingIndex = settings.instructor_custom_rates.findIndex(
        rate => rate.instructor.toString() === instructorId.toString()
    );

    if (existingIndex !== -1) {
        // Actualizar la existente
        settings.instructor_custom_rates[existingIndex].commission_rate = commissionRate;
        settings.instructor_custom_rates[existingIndex].reason = reason;
        settings.instructor_custom_rates[existingIndex].effective_from = new Date();
        settings.instructor_custom_rates[existingIndex].created_by = adminId;
    } else {
        // Agregar nueva
        settings.instructor_custom_rates.push({
            instructor: instructorId,
            commission_rate: commissionRate,
            reason: reason,
            effective_from: new Date(),
            created_by: adminId
        });
    }

    settings.last_updated_by = adminId;
    await settings.save();

    return settings;
};

// Método para remover comisión personalizada
PlatformCommissionSettingsSchema.statics.removeCustomCommission = async function (instructorId, adminId) {
    const settings = await this.getSettings();

    settings.instructor_custom_rates = settings.instructor_custom_rates.filter(
        rate => rate.instructor.toString() !== instructorId.toString()
    );

    settings.last_updated_by = adminId;
    await settings.save();

    return settings;
};

const PlatformCommissionSettings = mongoose.model("platform_commission_settings", PlatformCommissionSettingsSchema);
export default PlatformCommissionSettings;
