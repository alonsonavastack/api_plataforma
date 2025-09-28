import mongoose, {Schema} from "mongoose";

const DiscountSchema = new Schema({
    type_campaign: {type:Number,required:true,default: 1}, // 1: normal, 2: flash, 3: banner
    type_discount: {type:Number,required:true,default: 1}, // 1: porcentaje, 2: monto fijo
    discount:{type: Number,required:true},
    start_date: {type: Date,required:true},
    end_date: {type: Date,required:true},
    start_date_num: {type: Number,required:true},
    end_date_num: {type: Number,required:true},
    type_segment:{type:Number,required:true,default:1},// 1: curso, 2: categoria, 3: proyecto
    state: {type: Boolean, default: true}, // true: activo, false: inactivo
    courses: [{type: Schema.ObjectId, ref: 'course'}],
    projects: [{type: Schema.ObjectId, ref: 'project'}],
    categories: [{type: Schema.ObjectId, ref: 'categorie'}],
},{
    timestamps: true,
}); 

const Discount = mongoose.model("discount",DiscountSchema);
export default Discount;