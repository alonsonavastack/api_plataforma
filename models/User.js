import mongoose, {Schema} from "mongoose";

const UserSchema = new Schema({
    rol:{type:String,maxlength: 30,required:true, enum: ['admin', 'instructor', 'cliente']},
    name:{type:String,maxlength: 250,required:true},
    surname:{type:String,maxlength: 250,required:true},
    email:{type:String,maxlength: 250,required:true,unique:true},
    password:{type:String,maxlength: 250,required:true},
    avatar:{type:String,maxlength: 250,required:false},
    state:{type:Boolean,default: true},//true ES ACTIVO false ES INACTIVO
    phone: {type: String, maxlength: 30,required:false},
    birthday: {type: Date, required:false},
    
    // ✅ Información de ubicación y pago
    country: {
        type: String,
        maxlength: 2,
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
    profession: {type: String, maxlength: 250,required:false},
    description: {type: String,required:false},
    
    // ✅ CONFIGURACIÓN FISCAL (MÉXICO - ADAPTADO PARA USD/MXN)
    fiscal: {
        regimenFiscal: {
            type: String,
            enum: ['626', 'honorarios', '612', '621', '625', null],
            default: null,
            required: false
        },
        rfc: {type: String, maxlength: 13, uppercase: true, trim: true, required: false},
        razonSocial: {type: String, maxlength: 250, required: false},
        domicilioFiscal: {type: String, maxlength: 500, required: false},
        
        // Control de ingresos acumulados (en MXN para RESICO)
        ingresoAcumuladoAnual: {type: Number, default: 0},
        anioFiscalActual: {type: Number, default: new Date().getFullYear()},
        limiteAnualResico: {type: Number, default: 3500000},
        ultimaActualizacionIngresos: {type: Date},
        
        // Configuración de pagos (transferencias bancarias MX)
        cuentaBancaria: {
            banco: {type: String, maxlength: 100},
            clabe: {type: String, maxlength: 18},
            numeroCuenta: {type: String, maxlength: 30},
            titular: {type: String, maxlength: 250},
            currency: {type: String, maxlength: 3, default: 'MXN'},
            swift: {type: String, maxlength: 11},
            iban: {type: String, maxlength: 34},
            routingNumber: {type: String, maxlength: 20},
            accountType: {type: String, enum: ['checking', 'savings', null], default: null}
        },
        
        // Control de alertas fiscales
        alertaLimite80Enviada: {type: Boolean, default: false},
        alertaLimite90Enviada: {type: Boolean, default: false},
        bloqueadoPorLimite: {type: Boolean, default: false},
        porcentajeISRActual: {type: Number, default: 1},
        
        // Metadata
        fechaAltaSAT: {type: Date},
        actividadesEconomicas: [{type: String}],
        notas: {type: String}
    },
    
    // Campos de verificación OTP
    isVerified: {type: Boolean, default: false},
    otp: {
        code: {type: String},
        expiresAt: {type: Date},
        attempts: {type: Number, default: 0},
        resends: {type: Number, default: 0},
        lastResendAt: {type: Date}
    },
    
    // Campos de recuperación de contraseña
    passwordRecoveryOtp: {
        code: {type: String},
        expiresAt: {type: Date},
        attempts: {type: Number, default: 0},
        resends: {type: Number, default: 0},
        lastResendAt: {type: Date}
    },
},{
    timestamps: true
});

const User = mongoose.model("user",UserSchema);
export default User;