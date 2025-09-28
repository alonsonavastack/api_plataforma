import mongoose,{Schema} from "mongoose";

const CourseClaseSchema = new Schema({
    title: {type: String,maxlength: 250,required:true},
    section: {type: Schema.ObjectId, ref: 'course_section',required:true},
    vimeo_id: {type: String,required:false},
    time: {type: Number,required:false},// Duración de la clase en segundos
    description: {type: String,required:true},
    state: {type:Boolean,default: true}, // true es activo y false inactivo
},{
    timestamps: true
});

const CourseClase = mongoose.model("course_clase",CourseClaseSchema);
export default CourseClase;