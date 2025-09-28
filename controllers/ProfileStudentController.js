import models from "../models/index.js";
import resource from "../resource/index.js";
import token from "../service/token.js";
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { N_CLASES_OF_COURSES, sumarTiempos } from "../utils/helpers.js";

// Necesitamos __dirname para manejar las rutas de archivos
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formDateToYMD(date,type=1) {
    const year = date.getFullYear();

    const month = String(date.getMonth() + 1).padStart(2,'0');//07 08 09

    const day =  String(date.getDate()).padStart(2,'0');// 2 ,3 ,4
    if(type == 1){
        return day+"/"+month+"/"+year; // 01/03/2023
    }
    return year+"-"+month+"-"+day; // 01/03/2023
}
export default {
    profile_student: async(req,res) => {
        try {
            
            const user = await token.decode(req.headers.token);
            const Student = await models.User.findById(user._id);

            // 1. OBTENER TODOS LOS CURSOS DEL ESTUDIANTE CON UNA SOLA CONSULTA OPTIMIZADA
            const enrolled_courses_data = await models.CourseStudent.aggregate([
                { $match: { user: Student._id } },
                {
                    $lookup: {
                        from: "courses",
                        localField: "course",
                        foreignField: "_id",
                        as: "course_info"
                    }
                },
                { $unwind: "$course_info" },
                {
                    $lookup: {
                        from: "course_sections",
                        localField: "course_info._id",
                        foreignField: "course",
                        as: "sections"
                    }
                },
                {
                    $lookup: {
                        from: "course_clases",
                        localField: "sections._id",
                        foreignField: "section",
                        as: "clases"
                    }
                },
                {
                    $project: {
                        _id: 1,
                        clases_checked: 1,
                        state: 1,
                        course: "$course_info",
                        total_clases: { $size: "$clases" }
                    }
                }
            ]);

            const all_student_courses = enrolled_courses_data.map(enrollment => {
                const N_CLASES = enrollment.total_clases;
                const percentage = N_CLASES > 0 ? ((enrollment.clases_checked.length / N_CLASES) * 100).toFixed(2) : 0;
                return {
                    ...enrollment,
                    percentage,
                    course: resource.Course.api_resource_course(enrollment.course, null, 0, 0, 0, 0, N_CLASES),
                };
            });

            // 2. OBTENER TODAS LAS VENTAS Y PROYECTOS CON UNA SOLA CONSULTA OPTIMIZADA
            const sales_data = await models.Sale.aggregate([
                { $match: { user: Student._id } },
                {
                    $lookup: {
                        from: "sale_details",
                        localField: "_id",
                        foreignField: "sale",
                        as: "details"
                    }
                }
            ]);

            // OPTIMIZACIÓN: Evitar N+1 en detalles de venta
            const all_details = sales_data.flatMap(sale => sale.details);
            const detail_ids = all_details.map(d => d._id);
            const course_ids = all_details.filter(d => d.product_type === 'course').map(d => d.product);
            const project_ids = all_details.filter(d => d.product_type === 'project').map(d => d.product);

            const [reviews, courses, projects] = await Promise.all([
                models.Review.find({ sale_detail: { $in: detail_ids } }).lean(),
                models.Course.find({ _id: { $in: course_ids } }).populate('categorie').lean(),
                models.Project.find({ _id: { $in: project_ids } }).populate('categorie').lean()
            ]);

            const reviewsByDetailId = reviews.reduce((acc, review) => { acc[review.sale_detail.toString()] = review; return acc; }, {});
            const productsById = {
                ...courses.reduce((acc, course) => { acc[course._id.toString()] = course; return acc; }, {}),
                ...projects.reduce((acc, project) => { acc[project._id.toString()] = project; return acc; }, {})
            };

            const backendUrl = process.env.URL_BACKEND || 'http://localhost:3000';
            let projects_collection = [];
            const sales_collection = sales_data.map(sale => {
                const sale_details_with_reviews = sale.details.map(detail => {
                    const product = productsById[detail.product.toString()];
                    const review = reviewsByDetailId[detail._id.toString()];
                    const product_info = {
                        _id: product._id, title: product.title,
                        imagen: product.imagen, // Devolvemos solo el nombre del archivo
                        categorie: product.categorie,
                    };
                    if (detail.product_type === 'project') { projects_collection.push(product_info); }
                    return { ...detail, product: product_info, review: review || null };
                });
                return { ...sale, sales_details: sale_details_with_reviews, created_at: formDateToYMD(sale.createdAt) };
            });

            res.status(200).json({
                enrolled_course_count: all_student_courses.length,
                actived_course_count: all_student_courses.filter(c => c.state === 1 && c.clases_checked.length > 0).length,
                termined_course_count: all_student_courses.filter(c => c.state === 2).length,
                profile: {
                    name: Student.name,
                    surname: Student.surname,
                    email: Student.email,
                    profession: Student.profession,
                    description: Student.description,
                    phone: Student.phone,
                    birthday: Student.birthday ? formDateToYMD(new Date(Student.birthday)) : null,
                    birthday_format: Student.birthday ? formDateToYMD(new Date(Student.birthday), 2) : null, // No hay cambios aquí, pero se podría aplicar el mismo principio
                    avatar: Student.avatar, // Devolvemos solo el nombre del archivo, igual que en el perfil del instructor
                },
                enrolled_course_news: all_student_courses,
                actived_course_news: all_student_courses.filter(c => c.state === 1 && c.clases_checked.length > 0),
                termined_course_news: all_student_courses.filter(c => c.state === 2),
                sales: sales_collection,
                projects: projects_collection,
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    update_student: async(req,res) => {
        try {
            // echo@gmail.com
            let user = await token.decode(req.headers.token);

            // Solo validar el email si se está enviando en el body (no en subida de avatar)
            if (req.body.email) {
                const VALID_USER = await models.User.findOne({email: req.body.email, _id: {$ne: user._id}});
                if(VALID_USER){
                    res.status(200).json({
                        message: 403,
                        message_text: "EL USUARIO INGRESADO YA EXISTE",
                    });
                    return;
                }
            }

            if(req.body.password){
                req.body.password = await bcrypt.hash(req.body.password,10);
            }

            if(req.files && req.files.avatar){
                // Si se sube una nueva imagen, eliminamos la anterior.
                const oldUser = await models.User.findById(user._id);
                if (oldUser.avatar && fs.existsSync(path.join(__dirname, '../uploads/user/', oldUser.avatar))) {
                    fs.unlinkSync(path.join(__dirname, '../uploads/user/', oldUser.avatar));
                }
                const img_path = req.files.avatar.path;
                // path.basename extrae el nombre del archivo de la ruta, ej: "fdfdfd.jpg"
                // Es la forma más segura y compatible entre sistemas operativos (Windows, Linux, Mac)
                const avatar_name = path.basename(img_path);//extraer nombre
                req.body.avatar = avatar_name;
            }

            const NUser = await models.User.findByIdAndUpdate({_id: user._id}, req.body, {
                new: true // Devuelve el documento actualizado
            });

            res.status(200).json({
                message: 'EL USUARIO SE EDITO CORRECTAMENTE',
                user: resource.User.api_resource_user(NUser),
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    review_register: async(req,res) => {
        try {
            let user = await token.decode(req.headers.token);

            req.body.user = user._id;
            // El modelo Review ya tiene product_type y product, así que se guarda correctamente.
            let review = await models.Review.create(req.body);

            res.status(200).json({
                message: 'LA RESEÑA SE HA REGISTRADO CORRECTAMENTE',
                review: review
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR',
            });
        }
    },
    review_update: async(req,res) => {
        try {
           
            let review_id = req.body._id;
            let user = await token.decode(req.headers.token);
            // Asegurarse que el usuario solo pueda editar su propia reseña
            await models.Review.findOneAndUpdate({_id: review_id, user: user._id},req.body);
            
            let review = await models.Review.findById({_id: req.body._id});

            res.status(200).json({
                message: 'LA RESEÑA SE HA EDITADO CORRECTAMENTE',
                review: review
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR',
            });
        }
    },
    course_leason: async(req,res) => {
        try {
            let SLUG = req.params.slug;
            let user = await token.decode(req.headers.token);

            let COURSE = await models.Course.findOne({slug: SLUG}).populate(["categorie","user"]);
            if(!COURSE){
                res.status(200).json({
                    message: 403,
                    message_text: 'EL CURSO NO EXISTE'
                });
                return;
            }

            let course_student = await models.CourseStudent.findOne({course: COURSE._id,user: user._id});

            if(!course_student){
                res.status(200).json({
                    message: 403,
                    message_text: 'TU NO ESTAS INSCRITO EN ESTE CURSO'
                });
                return;
            }

            // OPTIMIZACIÓN: Usar agregación para obtener toda la malla curricular, clases y archivos en una sola consulta.
            const MALLA_CURRICULAR = await models.CourseSection.aggregate([
                { $match: { course: COURSE._id } },
                {
                    $lookup: {
                        from: "course_clases",
                        localField: "_id",
                        foreignField: "section",
                        // Usamos un pipeline anidado para buscar los archivos de cada clase
                        pipeline: [
                            {
                                $lookup: {
                                    from: "course_clase_files",
                                    localField: "_id",
                                    foreignField: "clase",
                                    as: "files"
                                }
                            }
                        ],
                        as: "clases",
                    }
                },
                {
                    $addFields: {
                        clases: {
                            $map: {
                                input: "$clases",
                                as: "clase",
                                in: {
                                    $mergeObjects: [
                                        "$$clase",
                                        {
                                            // Formatear la URL de Vimeo
                                            vimeo_id: { $cond: { if: "$$clase.vimeo_id", then: { $concat: ["https://player.vimeo.com/video/", "$$clase.vimeo_id"] }, else: null } },
                                            // Formatear la URL de los archivos
                                            files: {
                                                $map: {
                                                    input: "$$clase.files",
                                                    as: "file",
                                                    in: {
                                                        _id: "$$file._id",
                                                        file_name: "$$file.file_name",
                                                        size: "$$file.size",
                                                        file: { $concat: [process.env.URL_BACKEND, "/api/course_clase/file-clase/", "$$file.file"] }
                                                    }
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            ]);

            // Calcular totales después de la consulta
            let TIME_TOTAL_SECTIONS = 0;
            let FILES_TOTAL_SECTIONS = 0;
            let NUMERO_TOTAL_CLASES = 0;

            MALLA_CURRICULAR.forEach(section => {
                let time_clases_section = section.clases.reduce((acc, clase) => acc + (clase.time || 0), 0);
                section.time_parse = sumarTiempos(String(time_clases_section));
                TIME_TOTAL_SECTIONS += time_clases_section;
                NUMERO_TOTAL_CLASES += section.clases.length;
                section.clases.forEach(clase => {
                    FILES_TOTAL_SECTIONS += clase.files.length;
                });
            });

            //DURACIÓN TOTAL DEL CURSO
            let TIME_TOTAL_COURSE = sumarTiempos(String(TIME_TOTAL_SECTIONS));
            //NUMERO DE CURSOS DEL INSTRUCTOR
            // INFORMACION DEL INSTRUCTOR
            const instructorStats = await models.Course.aggregate([
                { $match: { user: COURSE.user._id, state: 2 } },
                {
                    $lookup: {
                        from: "course_students",
                        localField: "_id",
                        foreignField: "course",
                        as: "students"
                    }
                },
                {
                    $lookup: {
                        from: "reviews",
                        localField: "_id",
                        foreignField: "product",
                        as: "reviews"
                    }
                },
                {
                    $group: {
                        _id: "$user",
                        total_courses: { $sum: 1 },
                        total_students: { $sum: { $size: "$students" } },
                        total_reviews: { $sum: { $size: "$reviews" } },
                        avg_rating_sum: { $sum: { $avg: "$reviews.rating" } }
                    }
                }
            ]);

            let COUNT_COURSE_INSTRUCTOR = 0;
            let N_STUDENTS_SUM_TOTAL = 0;
            let NUM_REVIEW_SUM_TOTAL = 0;
            let AVG_RATING_INSTRUCTOR = 0;

            if (instructorStats.length > 0) {
                const stats = instructorStats[0];
                COUNT_COURSE_INSTRUCTOR = stats.total_courses;
                N_STUDENTS_SUM_TOTAL = stats.total_students;
                NUM_REVIEW_SUM_TOTAL = stats.total_reviews;
                AVG_RATING_INSTRUCTOR = stats.total_reviews > 0 ? (stats.avg_rating_sum / stats.total_courses).toFixed(2) : 0;
            }

            // REVIEWS DEL CURSO SELECCIONADO
            let N_STUDENTS = await models.CourseStudent.count({course: COURSE._id});
            let REVIEWS = await models.Review.find({product: COURSE._id, product_type: 'course'}); // Correcto
            // 2 5 , 3
            // 5 + 3 = 8 / 2 = 4
            let AVG_RATING = REVIEWS.length > 0 ? (REVIEWS.reduce((sum,review) => sum + review.rating, 0)/REVIEWS.length).toFixed(2) : 0; 
            let NUM_REVIEW = REVIEWS.length;
            // 
            res.status(200).json({
                course: resource.Course.api_resource_course_landing(COURSE,null,
                    MALLA_CURRICULAR,
                    TIME_TOTAL_COURSE,
                    FILES_TOTAL_SECTIONS,
                    COUNT_COURSE_INSTRUCTOR,
                    NUMERO_TOTAL_CLASES,
                    N_STUDENTS,
                    AVG_RATING,
                    NUM_REVIEW,
                    N_STUDENTS_SUM_TOTAL,
                    NUM_REVIEW_SUM_TOTAL,
                    AVG_RATING_INSTRUCTOR
                ),
                course_student: course_student,
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR',
            });
        }
    },
    course_student: async(req,res) => {
        try {
            let COURSE_STUDENT_ID = req.body._id;

            let course_student = await models.CourseStudent.findByIdAndUpdate({_id: COURSE_STUDENT_ID},{
                clases_checked: req.body.clases_checked,
                state: req.body.state,
            });

            res.status(200).json({
                message: 'SE GUARDO LA SELECCION DE LA CLASE'
            })
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR',
            });
        }
    }
}