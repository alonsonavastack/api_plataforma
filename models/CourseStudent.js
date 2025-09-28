import mongoose, {Schema} from "mongoose";

const CourseStudentSchema = new Schema({
    user: {type: Schema.ObjectId, ref: 'user',required:true},
    course: {type: Schema.ObjectId, ref: 'course',required:true},
    clases_checked:[{type: Schema.ObjectId, ref: 'course_clase'}],
    state: {type: Number, default: 1},// 1: iniciado, 2: terminado
},{
    timestamps: true
});

const CourseStudent = mongoose.model("course_student",CourseStudentSchema);
export default CourseStudent;