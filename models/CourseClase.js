import mongoose,{Schema} from "mongoose";

const CourseClaseSchema = new Schema({
    title: {type: String,maxlength: 250,required:true},
    section: {type: Schema.ObjectId, ref: 'course_section',required:true},
    
    // NUEVOS CAMPOS para soportar múltiples plataformas
    video_platform: {type: String, enum: ['vimeo', 'youtube'], default: 'vimeo'}, // Tipo de plataforma
    video_id: {type: String, required: false}, // ID genérico (puede ser Vimeo o YouTube)
    
    // CAMPO LEGACY (mantener para compatibilidad con datos existentes)
    vimeo_id: {type: String, required: false}, // ⚠️ DEPRECADO pero lo mantenemos para compatibilidad
    
    time: {type: Number,required:false},// Duración de la clase en segundos
    description: {type: String,required:true},
    state: {type:Boolean,default: true}, // true es activo y false inactivo
},{
    timestamps: true
});

const CourseClase = mongoose.model("course_clase",CourseClaseSchema);
export default CourseClase;
