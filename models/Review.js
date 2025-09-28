import mongoose, {Schema} from "mongoose";

const ReviewSchema = new Schema({
    product_type: { type: String, required: true, enum: ['course', 'project'] },
    product: { type: Schema.ObjectId, required: true, refPath: 'product_type' },

    user: {type: Schema.ObjectId, ref: 'user', required:true},
    sale_detail: {type: Schema.ObjectId, ref: 'sale_detail', required:true},
    rating: {type: Number,required:true},
    description: {type: String, required:true},
},{
    timestamps: true,
}); 

const Review = mongoose.model("review",ReviewSchema);
export default Review;