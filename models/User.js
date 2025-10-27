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
    // is_instructor:{type:Number,required:false,default: null},// 1 es instructor
    profession: {type: String, maxlength: 250,required:false},
    description: {type: String,required:false},
    
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