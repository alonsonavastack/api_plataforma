import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema({
    rol: { type: String, maxlength: 30, required: true, enum: ['admin', 'instructor', 'cliente'] },
    name: { type: String, maxlength: 250, required: true },
    surname: { type: String, maxlength: 250, required: true },
    email: { type: String, maxlength: 250, required: true, unique: true },
    password: { type: String, maxlength: 250, required: true },
    avatar: { type: String, maxlength: 250, required: false },
    state: { type: Boolean, default: true },//true ES ACTIVO false ES INACTIVO
    phone: { type: String, maxlength: 30, required: false, unique: true, sparse: true },
    birthday: { type: Date, required: false },

    // ✅ Información de ubicación y pago
    country: {
        type: String,
        maxlength: 4,  // Permite códigos ISO (MX, US) e internacionales (INTL)
        uppercase: true,
        default: 'INTL',
        required: false
    },
    paymentMethod: {
        type: String,
        enum: ['bank_transfer', 'paypal', 'stripe', 'wise', 'payoneer', 'oxxo', 'sepa', null],
        default: null,
        required: false
    },
    // is_instructor:{type:Number,required:false,default: null},// 1 es instructor
    profession: { type: String, maxlength: 250, required: false },
    description: { type: String, required: false },

    // ✅ REDES SOCIALES (OPCIONALES)
    socialMedia: {
        facebook: { type: String, maxlength: 250, required: false },
        instagram: { type: String, maxlength: 250, required: false },
        youtube: { type: String, maxlength: 250, required: false },
        tiktok: { type: String, maxlength: 250, required: false },
        twitch: { type: String, maxlength: 250, required: false },
        website: { type: String, maxlength: 250, required: false },
        discord: { type: String, maxlength: 250, required: false },
        linkedin: { type: String, maxlength: 250, required: false },
        twitter: { type: String, maxlength: 250, required: false },
        github: { type: String, maxlength: 250, required: false },
        telegram: { type: String, maxlength: 250, required: false } // Username/Handle link
    },
    telegram_chat_id: { type: String, sparse: true }, // ID numérico para el bot

    // ✅ CONFIGURACIÓN FISCAL (MÉXICO - ADAPTADO PARA USD/MXN)
    fiscal: {
        regimenFiscal: {
            type: String,
            enum: ['626', 'honorarios', '612', '621', '625', null],
            default: null,
            required: false
        },
        rfc: { type: String, maxlength: 13, uppercase: true, trim: true, required: false },
        razonSocial: { type: String, maxlength: 250, required: false },
        domicilioFiscal: { type: String, maxlength: 500, required: false },

        // Control de ingresos acumulados (en MXN para RESICO)
        ingresoAcumuladoAnual: { type: Number, default: 0 },
        anioFiscalActual: { type: Number, default: new Date().getFullYear() },
        limiteAnualResico: { type: Number, default: 3500000 },
        ultimaActualizacionIngresos: { type: Date },

        // Configuración de pagos (transferencias bancarias MX)
        cuentaBancaria: {
            banco: { type: String, maxlength: 100 },
            clabe: { type: String, maxlength: 18 },
            numeroCuenta: { type: String, maxlength: 30 },
            titular: { type: String, maxlength: 250 },
            currency: { type: String, maxlength: 3, default: 'MXN' },
            swift: { type: String, maxlength: 11 },
            iban: { type: String, maxlength: 34 },
            routingNumber: { type: String, maxlength: 20 },
            accountType: { type: String, enum: ['checking', 'savings', null], default: null }
        },

        // Control de alertas fiscales
        alertaLimite80Enviada: { type: Boolean, default: false },
        alertaLimite90Enviada: { type: Boolean, default: false },
        bloqueadoPorLimite: { type: Boolean, default: false },
        porcentajeISRActual: { type: Number, default: 1 },

        // Metadata
        fechaAltaSAT: { type: Date },
        actividadesEconomicas: [{ type: String }],
        notas: { type: String }
    },

    // 🆕 SLUG ÚNICO PARA PERFILES PÚBLICOS
    slug: {
        type: String,
        unique: true,
        sparse: true, // Permite valores null mientras se migran usuarios existentes
        lowercase: true,
        trim: true,
        maxlength: 100
    },

    // Campos de verificación OTP
    isVerified: { type: Boolean, default: false },
    otp: {
        code: { type: String },
        expiresAt: { type: Date },
        attempts: { type: Number, default: 0 },
        resends: { type: Number, default: 0 },
        lastResendAt: { type: Date }
    },

    // Campos de recuperación de contraseña
    passwordRecoveryOtp: {
        code: { type: String },
        expiresAt: { type: Date },
        attempts: { type: Number, default: 0 },
        resends: { type: Number, default: 0 },
        lastResendAt: { type: Date }
    },
}, {
    timestamps: true
});

// 🔧 Hook para generar slug automáticamente con protección anti-duplicados
UserSchema.pre('save', async function (next) {
    // Solo generar slug si es un usuario nuevo o si no tiene slug
    if (this.isNew || !this.slug) {
        const maxAttempts = 100; // Límite de intentos para evitar bucles infinitos
        let attempts = 0;

        // Generar slug base desde nombre y apellido
        const baseSlug = `${this.name} ${this.surname}`
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remover tildes
            .replace(/[^a-z0-9]+/g, '-')     // Reemplazar espacios y caracteres especiales
            .replace(/^-+|-+$/g, '');         // Remover guiones al inicio/fin

        let slug = baseSlug;
        let counter = 1;

        // 🔒 Buscar slugs duplicados con límite de intentos
        while (attempts < maxAttempts) {
            try {
                const existingUser = await mongoose.model('user').findOne({
                    slug: slug,
                    _id: { $ne: this._id }
                });

                if (!existingUser) {
                    break; // ✅ Slug único encontrado
                }

                // ❌ Existe: agregar contador
                slug = `${baseSlug}-${counter}`;
                counter++;
                attempts++;
            } catch (error) {
                console.error('❌ Error verificando slug único:', error);
                // En caso de error, usar timestamp para garantizar unicidad
                slug = `${baseSlug}-${Date.now()}`;
                break;
            }
        }

        // 🚨 Si llegó al límite, usar timestamp
        if (attempts >= maxAttempts) {
            console.warn('⚠️ Límite de intentos alcanzado, usando timestamp');
            slug = `${baseSlug}-${Date.now()}`;
        }

        this.slug = slug;
        console.log(`✅ Slug generado para ${this.name} ${this.surname}: ${slug}`);
    }
    next();
});

const User = mongoose.model("user", UserSchema);
export default User;