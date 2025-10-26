import mongoose, {Schema} from "mongoose";

const ProjectSchema = new Schema({
    title: {type:String, maxlength: 250, required: true},
    subtitle: {type:String, required: true},
    description: {type:String, required:true},
    
    imagen: {type:String, maxlength:250, required:true},
    url_video: {type:String, required:false},
    
    // Archivos ZIP adjuntos al proyecto
    files: [{
        name: {type: String, required: true}, // Nombre original del archivo
        filename: {type: String, required: true}, // Nombre único guardado en el servidor
        size: {type: Number, required: true}, // Tamaño en bytes
        uploadDate: {type: Date, default: Date.now}
    }],
    
    categorie: {type:Schema.ObjectId, ref: 'categorie', required:true},
    
    price_mxn:{type:Number, required:false}, // Campo legacy, ahora opcional
    price_usd: {type:Number, required:true},

    state: {type:Number, default: 1}, // 1 es borrador, 2 es publico, 3 es anulado
    user: {type:Schema.ObjectId, ref: 'user', required:true},
    featured: {type: Boolean, default: false} // Campo para destacar el proyecto
},{
    timestamps: true
});

const Project = mongoose.model("project", ProjectSchema);
export default Project;
