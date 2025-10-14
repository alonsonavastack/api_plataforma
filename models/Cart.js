import mongoose, {Schema} from "mongoose";

const CartSchema = new Schema({
    user: {type: Schema.ObjectId, ref: 'user',required:true},
    product_type: { type: String, required: true, enum: ['course', 'project'] },
    product: { type: Schema.ObjectId, required: true, refPath: 'product_type' },

    type_discount: {type: Number,required: false}, //1 es porcentaje y 2 es monto fijo
    discount: {type: Number, required: false},
    campaign_discount: {type: Number, required:false},// 1 es normal , 2 es flash y 3 es banner
    code_cupon: {type:String,required:false},
    code_discount: {type:String,required:false},

    price_unit: {type:Number,required:true},
    subtotal: {type:Number,required:true},
    total: {type:Number,required:true},
},{
    timestamps: true
});

// Índice compuesto para evitar duplicados
CartSchema.index({ user: 1, product: 1 }, { unique: true });

const Cart = mongoose.model("cart",CartSchema);
export default Cart;
