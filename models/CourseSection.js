import mongoose,{Schema} from "mongoose";

const CourseSectionSchema = new Schema({
    title: {type: String,maxlength: 250,required:true},
    course: {type: Schema.ObjectId, ref: 'course',required:true},
    state: {type:Boolean,default: true}, // true es activo y false inactivo
},{
    timestamps: true
});

const CourseSection = mongoose.model("course_section",CourseSectionSchema);
export default CourseSection;