import mongoose, {Schema} from "mongoose";

const CouponSchema = new Schema({
    code: {type: String,maxlength: 50,required:true},
    type_discount: {type:Number,required:true,default: 1}, // 1: porcentaje, 2: monto fijo
    discount:{type: Number,required:true},
    type_count:{type:Number,required:true,default:1},// 1: ilimitado, 2: limitado
    num_use:{type: Number,required:true},
    type_coupon:{type:Number,required:true,default:1},// 1: curso, 2: categoria, 3: proyecto
    state: {type: Boolean,default: true}, // true: activo, false: inactivo
    courses: [{type: Schema.ObjectId, ref: 'course'}],
    projects: [{type: Schema.ObjectId, ref: 'project'}],
    categories: [{type: Schema.ObjectId, ref: 'categorie'}],
},{
    timestamps: true,
}); 

const Coupon = mongoose.model("coupon",CouponSchema);
export default Coupon;