import models from "../models/index.js";
import resource from "../resource/index.js";
import { notifyNewCourse } from '../services/telegram.service.js';

import fs from 'fs'
import path from 'path'

// Necesitamos __dirname para manejar las rutas de archivos en ES Modules
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { UploadVideoVimeo } from "../utils/vimeo.js";

export default {
    register: async(req,res) => {
        try {
            
            let IS_VALID_COURSE = await models.Course.findOne({title: req.body.title});
            if(IS_VALID_COURSE){
                res.status(200).json({
                    message: 403,
                    message_text: "EL CURSO INGRESADO YA EXISTE, INTENTE CON OTRO TITULO"
                });
                return;
            }

            req.body.slug = req.body.title.toLowerCase().replace(/ /g,'-').replace(/[^\w-]+/g,'');

            // 🔥 NUEVO: Convertir isFree de string a boolean
            if (req.body.isFree !== undefined) {
                req.body.isFree = req.body.isFree === 'true' || req.body.isFree === true;
            }

            if(req.files && req.files.portada){
                const img_path = req.files.portada.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
            }

            // Si el usuario es un instructor, el curso se crea como borrador (estado 1)
            // Si es admin, se respeta el estado que venga en el body (o se puede poner un default)
            if (req.user.rol === 'instructor') {
                req.body.state = 1; // 1: Borrador
                // Asignamos el ID del instructor logueado directamente en el backend
                req.body.user = req.user._id;
            } else if (req.user.rol === 'admin') {
                // El admin puede decidir el estado, si no viene, lo ponemos como borrador por seguridad.
                req.body.state = req.body.state || 1;
            }

            let NewCourse = await models.Course.create(req.body);
            // Populamos el usuario y la categoría para devolver el objeto completo
            NewCourse = await models.Course.findById(NewCourse._id).populate('user').populate('categorie');

            // 📨 Enviar notificación a Telegram de nuevo curso
            try {
                await notifyNewCourse(NewCourse, NewCourse.user);
                console.log('✅ Notificación de Telegram enviada para nuevo curso');
            } catch (telegramError) {
                console.error('⚠️  La notificación de Telegram falló, pero el curso se creó correctamente:', telegramError.message);
            }

            res.status(200).json({
                course: NewCourse,
                message: "EL CURSO SE REGISTRÓ CORRECTAMENTE"
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    update: async(req,res) => {
        try {
            const IS_VALID_COURSE = await models.Course.findOne({title: req.body.title, _id: {$ne: req.body._id}});
            if(IS_VALID_COURSE){
                res.status(200).json({
                    message: 403,
                    message_text: "EL CURSO INGRESADO YA EXISTE, INTENTE CON OTRO TITULO"
                });
                return;
            }

            req.body.slug = req.body.title.toLowerCase().replace(/ /g,'-').replace(/[^\w-]+/g,'');

            // 🔥 NUEVO: Convertir isFree de string a boolean
            if (req.body.isFree !== undefined) {
                req.body.isFree = req.body.isFree === 'true' || req.body.isFree === true;
            }

            if(req.files && req.files.portada){
                // Si se sube una nueva imagen, eliminamos la anterior.
                const oldCourse = await models.Course.findById(req.body._id);
                if (oldCourse.imagen && fs.existsSync(path.join(__dirname, '../uploads/course/', oldCourse.imagen))) {
                    fs.unlinkSync(path.join(__dirname, '../uploads/course/', oldCourse.imagen));
                }
                const img_path = req.files.portada.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
            }

            // Un instructor no puede cambiar el estado de un curso.
            if (req.user.rol === 'instructor') {
                delete req.body.state;
            }

            // 1. Actualiza el curso
            await models.Course.findByIdAndUpdate(req.body._id, req.body);
            // 2. Vuelve a buscarlo para obtener el objeto completo y populado
            const updatedCourse = await models.Course.findById(req.body._id).populate('user').populate('categorie');

            res.status(200).json({
                course: updatedCourse, // 3. Devuelve el objeto completo
                message: "EL CURSO SE EDITÓ CORRECTAMENTE"
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    list: async(req,res) => {
        try {
            
            const search = req.query.search;
            const state = req.query.state;
            const categorie = req.query.categorie;

            const filter = {};

            if(search){
                filter.title = new RegExp(search,"i");
            }

            if(state){
                filter.state = state;
            }

            if(categorie){
                filter.categorie = categorie;
            }

            // Si el usuario es un instructor, solo listamos sus cursos.
            if (req.user.rol === 'instructor') {
                filter.user = req.user._id;
            }

            const courses = await models.Course.find(filter).populate(["categorie","user"]).sort({ createdAt: -1 });

            res.status(200).json({
                courses: courses,
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    config_all: async(req,res) => {
        try {
            
            let Categories = await models.Categorie.find({state: 1});

            Categories = Categories.map((categorie) => {
                return {
                    _id: categorie._id,
                    title: categorie.title,
                }
            })

            let userFilter = { state: 1, rol: 'instructor' };
            // Si el usuario es un instructor, solo se devuelve a sí mismo en la lista.
            if (req.user.rol === 'instructor') {
                userFilter._id = req.user._id;
            }

            let Users = await models.User.find(userFilter);

            Users = Users.map((user) => {
                return {
                    _id: user._id,
                    name: user.name,
                    surname: user.surname,
                }
            })
            res.status(200).json({
                categories: Categories,
                users: Users,
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    show_course: async(req,res) => {
        try {
            const course_id = req.params["id"];
            const Course = await models.Course.findById({_id: course_id});

            
            res.status(200).json({
                course: resource.Course.api_resource_course(Course),
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    checkSales: async(req,res) => {
        try {
            const courseId = req.params.id;
            console.log('🔍 Verificando ventas y estudiantes para curso:', courseId);

            // Verificar permisos: solo el propietario o admin pueden verificar
            const course = await models.Course.findById(courseId).lean();
            if (!course) {
                return res.status(404).json({ 
                    message: 'Curso no encontrado',
                    hasSales: false,
                    hasStudents: false
                });
            }

            // Si es instructor, solo puede verificar sus propios cursos
            if (req.user.rol === 'instructor' && course.user.toString() !== req.user._id.toString()) {
                return res.status(403).json({ 
                    message: 'No tienes permiso para verificar este curso.',
                    hasSales: false,
                    hasStudents: false
                });
            }

            // 🔥 VALIDACIÓN 1: Buscar ventas donde el curso aparece en detail.product
            // Sale.detail es un subdocumento, no una colección separada
            const sales = await models.Sale.find({ 
                'detail.product': courseId,
                'detail.product_type': 'course'
            }).lean();

            // 🔥 VALIDACIÓN 2: Buscar estudiantes inscritos
            const students = await models.CourseStudent.find({ 
                course: courseId 
            }).lean();

            const hasSales = sales.length > 0;
            const hasStudents = students.length > 0;
            
            console.log(`📊 Curso tiene ${sales.length} venta(s) y ${students.length} estudiante(s)`);
            
            // Contar cuántos estudiantes diferentes compraron el curso
            const uniqueUsers = new Set(sales.map(sale => sale.user.toString()));
            console.log(`👥 Estudiantes únicos que compraron: ${uniqueUsers.size}`);

            res.status(200).json({
                hasSales: hasSales,
                hasStudents: hasStudents,
                saleCount: sales.length,
                studentCount: students.length,
                uniqueStudents: uniqueUsers.size,
                canDelete: !hasSales && !hasStudents // Solo se puede eliminar si NO tiene ventas NI estudiantes
            });
        } catch (error) {
            console.error('❌ Error al verificar ventas y estudiantes:', error);
            res.status(500).send({
                message: "HUBO UN ERROR AL VERIFICAR LAS VENTAS Y ESTUDIANTES",
                hasSales: true, // Por seguridad, asumir que tiene ventas en caso de error
                hasStudents: true
            });
        }
    },
    remove: async(req,res) => {
        try {
            const course_id = req.params.id;
            console.log('🛠️ Intentando eliminar curso:', course_id);
            console.log('👤 Usuario:', req.user.rol, '-', req.user._id.toString());

            // 1. VERIFICAR SI EL CURSO EXISTE
            const course = await models.Course.findById(course_id).lean();
            if (!course) {
                console.log('❌ Curso no encontrado');
                return res.status(404).send({ 
                    message: 'El curso no existe.',
                    code: 404 
                });
            }

            console.log('✅ Curso encontrado:', course.title);
            console.log('👨‍🏫 Propietario del curso:', course.user.toString());

            // 🔒 VALIDACIÓN 1: Verificar permisos de propiedad
            // Los instructores solo pueden eliminar sus propios cursos
            if (req.user.rol === 'instructor' && course.user.toString() !== req.user._id.toString()) {
                console.log('⛔ Permiso denegado: no es el propietario');
                return res.status(403).send({ 
                    message: 'No tienes permiso para eliminar este curso. Solo puedes eliminar tus propios cursos.',
                    code: 403 
                });
            }

            console.log('🔍 Verificando ventas y estudiantes del curso...');
            
            // 🔒 VALIDACIÓN 2: Verificar si el curso tiene ventas (integridad de datos)
            // Sale.detail es un subdocumento, no una colección separada
            const sales = await models.Sale.find({ 
                'detail.product': course_id,
                'detail.product_type': 'course'
            }).lean();

            console.log('📊 Total de ventas encontradas:', sales.length);
            
            if (sales.length > 0) {
                console.log('⚠️ Curso tiene ventas, bloqueando eliminación');
                console.log('📄 IDs de ventas:', sales.map(s => s._id));
                const uniqueUsers = new Set(sales.map(s => s.user.toString()));
                console.log('👥 Estudiantes únicos:', uniqueUsers.size);
                
                return res.status(200).json({
                    message: `EL CURSO NO SE PUEDE ELIMINAR PORQUE TIENE ${sales.length} VENTA(S) REGISTRADA(S) DE ${uniqueUsers.size} ESTUDIANTE(S). Esto protege la integridad de los registros de compra y ganancias de los estudiantes.`,
                    code: 403,
                    saleCount: sales.length,
                    uniqueStudents: uniqueUsers.size
                });
            }

            // 🔒 VALIDACIÓN 3: Verificar si el curso tiene estudiantes inscritos
            const students = await models.CourseStudent.find({ course: course_id }).lean();

            console.log('📊 Total de estudiantes inscritos:', students.length);

            if (students.length > 0) {
                console.log('⚠️ Curso tiene estudiantes inscritos, bloqueando eliminación');
                console.log('🎓 IDs de estudiantes:', students.map(s => s.user));
                
                return res.status(200).json({
                    message: `EL CURSO NO SE PUEDE ELIMINAR PORQUE TIENE ${students.length} ESTUDIANTE(S) INSCRITO(S). Esto protege el acceso de los estudiantes a su contenido educativo.`,
                    code: 403,
                    studentCount: students.length
                });
            }

            console.log('✅ No hay ventas ni estudiantes, procediendo con la eliminación...');

            // 2. ELIMINAR IMAGEN DE PORTADA
            if (course.imagen) {
                const imagePath = path.join(__dirname, '../uploads/course/', course.imagen);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    console.log('🖼️ Imagen eliminada');
                }
            }

            // 3. ELIMINAR SECCIONES, CLASES Y ARCHIVOS
            const sections = await models.CourseSection.find({ course: course_id });
            console.log(`📚 Eliminando ${sections.length} sección(es)...`);
            
            for (const section of sections) {
                const clases = await models.CourseClase.find({ section: section._id });
                console.log(`  🎬 Eliminando ${clases.length} clase(s) de la sección "${section.title}"...`);
                
                for (const clase of clases) {
                    const claseFiles = await models.CourseClaseFile.find({ clase: clase._id });
                    for (const file of claseFiles) {
                        const filePath = path.join(__dirname, '../uploads/course/files/', file.file);
                        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                        await models.CourseClaseFile.findByIdAndDelete(file._id);
                    }
                    await models.CourseClase.findByIdAndDelete(clase._id);
                }
                await models.CourseSection.findByIdAndDelete(section._id);
            }

            // 4. ELIMINAR INSCRIPCIONES (aunque ya verificamos que no hay, por si acaso)
            await models.CourseStudent.deleteMany({ course: course_id });

            // 5. ELIMINAR EL CURSO
            await models.Course.findByIdAndDelete(course_id);
            console.log('✅ Curso eliminado exitosamente');

            res.status(200).send({
                message: 'EL CURSO Y TODOS SUS DATOS ASOCIADOS SE ELIMINARON CORRECTAMENTE',
                code: 200,
            });
        } catch (error) {
            console.error('❌ Error al eliminar curso:', error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    get_imagen: async(req,res) => {
        try {
            const img = req.params["img"];
            if(!img){
                res.status(500).send({
                    message: 'OCURRIO UN PROBLEMA'
                });
            }else{
                fs.stat('./uploads/course/'+img, function(err) {
                    let path_img;
                    if(!err){
                        path_img = './uploads/course/'+img;
                        res.status(200).sendFile(path.resolve(path_img));
                    }else{
                        // Si la imagen específica no se encuentra, servir una imagen por defecto
                        path_img = './uploads/default.jpg';
                        // Puedes agregar un log aquí para saber cuándo se está sirviendo la imagen por defecto
                        console.log(`Imagen no encontrada: ${img}. Sirviendo imagen por defecto.`);
                        res.status(200).sendFile(path.resolve(path_img));
                    }
                })
            }
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    upload_vimeo: async(req,res) => {
        try {
            const PathFile = req.files.video.path;
            const VideoMetaDato = {
                name: 'Video de prueba',
                description: 'Es un video para saber si la integración es correcta',
                privacy:{
                    view: 'anybody' // O 'nobody' si quieres que solo se vea embebido
                }
            }
            let vimeo_id_result = '';
            const result = await UploadVideoVimeo(PathFile,VideoMetaDato);
            if(result.message == 403){
                res.status(500).send({
                    message: 'HUBO UN ERROR'
                });
            }else{
                const ARRAY_VALUES = result.value.split("/");
                // /videos/852927231
                // ["","videos","852927231"]
                vimeo_id_result = ARRAY_VALUES[2];
                await models.Course.findByIdAndUpdate({_id: req.body._id},{
                    vimeo_id: vimeo_id_result
                })
    
                res.status(200).json({
                    message: 'LA PRUEBA FUE UN EXITO',
                    vimeo_id: "https://player.vimeo.com/video/"+vimeo_id_result,
                });
            }
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    list_settings: async(req,res) => {
        try {
            // Obtenemos todos los cursos, seleccionando solo los campos necesarios.
            // CORRECCIÓN: Se popula la información del usuario y la categoría para que la respuesta sea completa.
            const courses = await models.Course.find({}, { title: 1, subtitle: 1, imagen: 1, price_usd: 1, slug: 1, featured: 1 })
                                              .populate('user', 'name surname').populate('categorie', 'title');

            res.status(200).json({
                courses: courses // Devolvemos la propiedad 'courses' que el frontend espera
            });

        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'HUBO UN ERROR'
            });
        }
    },
    toggle_featured: async(req,res) => {
        // Lógica para marcar/desmarcar un curso como destacado.
        try {
            const courseId = req.params.id;
            const isFeatured = req.body.is_featured; // true o false

            // Usamos findByIdAndUpdate para actualizar solo el campo 'featured'.
            // Esto evita problemas de validación con otros campos requeridos como 'description'.
            const updatedCourse = await models.Course.findByIdAndUpdate(
                courseId,
                { featured: isFeatured },
                { new: true } // Devuelve el documento actualizado
            ).populate('user', 'name surname').populate('categorie', 'title');

            if (!updatedCourse) {
                return res.status(404).json({ message: 'Curso no encontrado' });
            }

            res.status(200).json({
                message: `El curso ha sido ${updatedCourse.featured ? 'marcado como destacado' : 'desmarcado'}.`,
                course: updatedCourse
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({ message: "HUBO UN ERROR" });
        }
    }
}