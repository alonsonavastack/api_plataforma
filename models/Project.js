import mongoose, {Schema} from "mongoose";

const ProjectSchema = new Schema({
    title: {type:String, maxlength: 250, required: true},
    subtitle: {type:String, required: true},
    description: {type:String, required:true},
    
    imagen: {type:String, maxlength:250, required:true},
    
    categorie: {type:Schema.ObjectId, ref: 'categorie', required:true},
    
    price_soles:{type:Number, required:true},
    price_usd: {type:Number, required:true},

    state: {type:Number, default: 1}, // 1 es borrador, 2 es publico, 3 es anulado
},{
    timestamps: true
});

const Project = mongoose.model("project", ProjectSchema);
export default Project;