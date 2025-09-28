import mongoose,{Schema} from "mongoose";

const CategorieSchema = new Schema({
    title: {type: String,maxlength: 250,required:true},
    imagen: {type: String,maxlength: 250,required:true},
    state: {type:Boolean,default: true}, // true es activo y false inactivo
},{
    timestamps: true
});

const Categorie = mongoose.model("categorie",CategorieSchema);
export default Categorie;