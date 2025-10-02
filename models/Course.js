import mongoose, {Schema} from "mongoose";

const CourseSchema = new Schema({
    title: {type:String,maxlength: 250,required: true},
    slug: {type:String,required: true},
    subtitle: {type:String,required: true},
    categorie: {type:Schema.ObjectId,ref: 'categorie',required:true},
    price_mxn:{type:Number,required:true},
    price_usd: {type:Number,required:true},
    imagen: {type:String,maxlength:250,required:true},
    description: {type:String,required:true},
    vimeo_id: {type:String,required:false},
    state: {type:Number,default: 1}, // 1 es borrador, 2 es publico, 3 es anulado
    user: {type:Schema.ObjectId,ref: 'user',required:true},
    level: {type:String,required: true},
    idioma: {type:String,required: true},
    requirements: [{type:String,required:true}],//["ANGULAR BAISCO","LARAVEL BASICO"]
    who_is_it_for: [{type:String,required:true}],
},{
    timestamps: true
});

const Course = mongoose.model("course",CourseSchema);
export default Course;