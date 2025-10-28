import mongoose, {Schema} from "mongoose";

const ReviewSchema = new Schema({
    product_type: { type: String, required: true, enum: ['course', 'project'] },
    product: { type: Schema.ObjectId, required: true, refPath: 'product_type' },

    user: {type: Schema.ObjectId, ref: 'user', required:true},
    sale_detail: {type: Schema.ObjectId, ref: 'sale_detail', required:true},
    rating: {type: Number, required:true},
    description: {type: String, required:true},

    // ✅ NUEVO: Campo para respuesta del instructor
    reply: {
        user: {type: Schema.ObjectId, ref: 'user'},  // Instructor que responde
        description: {type: String},                 // Contenido de la respuesta
        createdAt: {type: Date}                     // Fecha de respuesta
    }
},{
    timestamps: true,
}); 

const Review = mongoose.model("review", ReviewSchema);
export default Review;
