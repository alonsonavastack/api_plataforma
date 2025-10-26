import models from "../models/index.js";
import resource from "../resource/index.js";
import { notifyNewProject } from '../services/telegram.service.js';
import fs from 'fs';
import path from 'path';

// Necesitamos __dirname para manejar las rutas de archivos
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tamaño máximo de archivo en bytes (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Convierte una URL de video de YouTube o Vimeo a su formato "embed" para iframes.
 * @param {string} originalUrl - La URL original del video.
 * @returns {string | null} La URL embed o null si no es una URL válida.
 */
function getEmbedUrl(originalUrl) {
  if (!originalUrl) return null;

  try {
    const url = new URL(originalUrl);
    if (url.hostname.includes('youtube.com') && url.pathname.includes('watch')) {
      return `https://www.youtube.com/embed/${url.searchParams.get('v')}`;
    }
    if (url.hostname.includes('youtu.be')) {
      // Extraemos solo el ID del video, ignorando parámetros como '?si='
      return `https://www.youtube.com/embed/${url.pathname.split('/')[1]}`;
    }
    if (url.hostname.includes('vimeo.com')) {
      const videoId = url.pathname.split('/').pop();
      return `https://player.vimeo.com/video/${videoId}`;
    }
  } catch (error) {
    console.error('URL de video no válida:', originalUrl, error);
    return originalUrl; // Devolver la original si falla el parseo
  }
  return originalUrl; // Devolver la original si no coincide con los patrones
}

// POST /api/project/register
export const register = async (req, res) => {
        try {
            // El middleware 'auth.verifyDashboard' decodifica el token y añade el usuario a req.user
            // Si no existe, el middleware ya habría devuelto un error.

            const existingProject = await models.Project.findOne({ title: req.body.title });
            if (existingProject) {
                return res.status(200).json({
                    message: 403,
                    message_text: "EL PROYECTO CON ESTE TÍTULO YA EXISTE"
                });
            }

            if (req.files && req.files.imagen) {
                const img_path = req.files.imagen.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
            }

            // Asignar el usuario (instructor/admin) que está creando el proyecto
            req.body.user = req.user._id; // Se obtiene el ID del usuario desde el token verificado

            // Convertir la URL del video a formato embed si existe
            if (req.body.url_video) {
                req.body.video_link = getEmbedUrl(req.body.url_video);
            }

            // Si el usuario es un instructor, el proyecto se crea como borrador (estado 1)
            if (req.user.rol === 'instructor') {
                req.body.state = 1; // 1: Borrador
            } else if (req.user.rol === 'admin') {
                req.body.state = req.body.state || 1; // El admin decide, o borrador por defecto
            }

            const newProject = await models.Project.create(req.body);
            // Popular el proyecto con usuario y categoría para la notificación
            const populatedProject = await models.Project.findById(newProject._id).populate('user').populate('categorie');

            // 📨 Enviar notificación a Telegram de nuevo proyecto
            try {
                await notifyNewProject(populatedProject, populatedProject.user);
                console.log('✅ Notificación de Telegram enviada para nuevo proyecto');
            } catch (telegramError) {
                console.error('⚠️  La notificación de Telegram falló, pero el proyecto se creó correctamente:', telegramError.message);
            }

            res.status(200).json({
                project: resource.Project.api_resource_project(populatedProject),
                message: "EL PROYECTO SE REGISTRÓ CORRECTAMENTE"
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR"
            });
        }
    };

// POST /api/project/update
export const update = async (req, res) => {
        try {
            // El middleware 'auth.verifyDashboard' ya ha verificado el token y adjuntado el usuario a req.user
            
            const existingProject = await models.Project.findOne({ title: req.body.title, _id: { $ne: req.body._id } });
            if (existingProject) {
                return res.status(200).json({
                    message: 403,
                    message_text: "EL PROYECTO CON ESTE TÍTULO YA EXISTE"
                });
            }

            if (req.files && req.files.imagen) {
                const oldProject = await models.Project.findById(req.body._id).lean();

                // Verificación de permisos: un instructor solo puede editar sus propios proyectos.
                if (req.user.rol === 'instructor' && oldProject.user.toString() !== req.user._id.toString()) {
                    return res.status(403).json({ message: 'No tienes permiso para editar este proyecto.' });
                }

                if (oldProject.imagen && fs.existsSync(path.join(__dirname, '../uploads/project/', oldProject.imagen))) {
                    fs.unlinkSync(path.join(__dirname, '../uploads/project/', oldProject.imagen));
                }
                const img_path = req.files.imagen.path;
                const imagen_name = path.basename(img_path);
                req.body.imagen = imagen_name;
            }

            // Convertir la URL del video a formato embed si se está actualizando
            if (req.body.url_video) {
                req.body.video_link = getEmbedUrl(req.body.url_video);
            }

            // Un instructor no debería poder cambiar el estado o el autor del proyecto.
            if (req.user.rol === 'instructor') {
                delete req.body.user;
                delete req.body.state;
            }

            await models.Project.findByIdAndUpdate(req.body._id, req.body);
            const updatedProject = await models.Project.findById(req.body._id).populate('user').populate('categorie');

            res.status(200).json({
                project: updatedProject,
                message: "EL PROYECTO SE EDITÓ CORRECTAMENTE"
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR"
            });
        }
    };

// GET /api/project/list
export const list = async (req, res) => {
        try {
            // El middleware 'auth.verifyDashboard' ya ha verificado el token y adjuntado el usuario a req.user
            const search = req.query.search;
            const categorie = req.query.categorie;
            const sortBy = req.query.sortBy; // 'newest' o 'oldest'
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;
            const filter = {};

            // Si el usuario es un instructor, solo listamos sus proyectos.
            if (req.user.rol === 'instructor') {
                filter.user = req.user._id;
            }

            if (search) {
                filter.title = new RegExp(search, "i");
            }
            if (categorie) {
                filter.categorie = categorie;
            }

            // Añadir filtro por rango de fechas de creación
            if (startDate && endDate) {
                // Aseguramos que el rango cubra todo el día final
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                filter.createdAt = { $gte: new Date(startDate), $lte: endOfDay };
            } else if (startDate) {
                filter.createdAt = { $gte: new Date(startDate) };
            } else if (endDate) {
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                filter.createdAt = { $lte: endOfDay };
            }
            
            // Determinar el orden de los resultados
            let sortOption = { createdAt: -1 }; // Por defecto: más nuevos primero
            if (sortBy === 'oldest') {
                sortOption = { createdAt: 1 }; // Más antiguos primero
            }

            // Populamos 'user' para mostrar la información del instructor.
            // Se elimina la transformación a través de 'resource' que estaba eliminando el objeto 'user'.
            // Ahora se envían los proyectos directamente con los datos populados.
            const projects = await models.Project.find(filter)
                                                 .populate("categorie")
                                                 .populate("user")
                                                 .sort(sortOption);

            res.status(200).json({
                projects: projects,
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR"
            });
        }
    };

// GET /api/project/check-sales/:id
// Verificar si un proyecto tiene ventas (para habilitar/deshabilitar eliminación)
export const checkSales = async (req, res) => {
    try {
        const projectId = req.params.id;
        console.log('🔍 Verificando ventas para proyecto:', projectId);

        // Verificar permisos: solo el propietario o admin pueden verificar
        const project = await models.Project.findById(projectId).lean();
        if (!project) {
            return res.status(404).json({ 
                message: 'Proyecto no encontrado',
                hasSales: false 
            });
        }

        // Si es instructor, solo puede verificar sus propios proyectos
        if (req.user.rol === 'instructor' && project.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                message: 'No tienes permiso para verificar este proyecto.',
                hasSales: false
            });
        }

        // 🔥 CORRECCIÓN: Buscar ventas donde el proyecto aparece en detail.product
        // Sale.detail es un subdocumento, no una colección separada
        const sales = await models.Sale.find({ 
            'detail.product': projectId,
            'detail.product_type': 'project'
        }).lean();

        const hasSales = sales.length > 0;
        console.log(`📊 Proyecto tiene ${sales.length} venta(s)`);
        
        // Contar cuántos estudiantes diferentes compraron el proyecto
        const uniqueUsers = new Set(sales.map(sale => sale.user.toString()));
        console.log(`👥 Estudiantes únicos que compraron: ${uniqueUsers.size}`);

        res.status(200).json({
            hasSales: hasSales,
            saleCount: sales.length,
            uniqueStudents: uniqueUsers.size,
            canDelete: !hasSales // Solo se puede eliminar si NO tiene ventas
        });
    } catch (error) {
        console.error('❌ Error al verificar ventas:', error);
        res.status(500).send({
            message: "HUBO UN ERROR AL VERIFICAR LAS VENTAS",
            hasSales: true // Por seguridad, asumir que tiene ventas en caso de error
        });
    }
};

// GET /api/project/show/:id
export const show_project = async (req, res) => {
        try {
            const project = await models.Project.findById(req.params.id).populate(['categorie', 'user']);
            if (!project) {
                return res.status(404).json({ message: 'Proyecto no encontrado' });
            }
            res.status(200).json({
                project: resource.Project.api_resource_project(project)
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR"
            });
        }
    };

// GET /api/project/get-admin/:id
export const get_project_admin = async (req, res) => {
        try {
            const project = await models.Project.findById(req.params.id).populate(['categorie', 'user']);
            if (!project) {
                return res.status(404).json({ message: 'Proyecto no encontrado' });
            }

            // Verificación de permisos: un instructor solo puede ver sus propios proyectos.
            if (req.user.rol === 'instructor' && project.user._id.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'No tienes permiso para ver este proyecto.' });
            }

            res.status(200).json({
                project: project // Devolvemos el proyecto completo, sin pasar por el resource
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({ message: "HUBO UN ERROR" });
        }
    };

// DELETE /api/project/remove/:id
// Los instructores pueden eliminar sus propios proyectos SI NO tienen ventas
// Los admins pueden eliminar cualquier proyecto SI NO tiene ventas
export const remove = async (req, res) => {
        try {
            const projectId = req.params.id;
            console.log('🛠️ Intentando eliminar proyecto:', projectId);
            console.log('👤 Usuario:', req.user.rol, '-', req.user._id.toString());
            
            // Buscar el proyecto
            const project = await models.Project.findById(projectId).lean();
            if (!project) {
                console.log('❌ Proyecto no encontrado');
                return res.status(404).json({ 
                    message: 'Proyecto no encontrado',
                    code: 404 
                });
            }

            console.log('✅ Proyecto encontrado:', project.title);
            console.log('👨‍🏫 Propietario del proyecto:', project.user.toString());

            // 🔒 VALIDACIÓN 1: Verificar permisos de propiedad
            // Los instructores solo pueden eliminar sus propios proyectos
            if (req.user.rol === 'instructor' && project.user.toString() !== req.user._id.toString()) {
                console.log('⛔ Permiso denegado: no es el propietario');
                return res.status(403).json({ 
                    message: 'No tienes permiso para eliminar este proyecto. Solo puedes eliminar tus propios proyectos.',
                    code: 403 
                });
            }

            console.log('🔍 Verificando ventas del proyecto...');
            // 🔒 VALIDACIÓN 2: Verificar si el proyecto tiene ventas (integridad de datos)
            // Sale.detail es un subdocumento, no una colección separada
            const sales = await models.Sale.find({ 
                'detail.product': projectId,
                'detail.product_type': 'project'
            }).lean();

            console.log('📊 Total de ventas encontradas:', sales.length);
            
            if (sales.length > 0) {
                console.log('⚠️ Proyecto tiene ventas, bloqueando eliminación');
                console.log('📄 IDs de ventas:', sales.map(s => s._id));
                const uniqueUsers = new Set(sales.map(s => s.user.toString()));
                console.log('👥 Estudiantes únicos:', uniqueUsers.size);
                
                return res.status(200).json({
                    message: `EL PROYECTO NO SE PUEDE ELIMINAR PORQUE TIENE ${sales.length} VENTA(S) REGISTRADA(S) DE ${uniqueUsers.size} ESTUDIANTE(S). Esto protege la integridad de los registros de compra y ganancias de los estudiantes.`,
                    code: 403,
                    saleCount: sales.length,
                    uniqueStudents: uniqueUsers.size
                });
            }

            console.log('✅ No hay ventas, procediendo con la eliminación...');

            // Eliminar imagen
            if (project.imagen) {
                const imagePath = path.join(__dirname, '../uploads/project/', project.imagen);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    console.log('🖼️ Imagen eliminada');
                }
            }

            // Eliminar archivos ZIP
            if (project.files && project.files.length > 0) {
                console.log(`📦 Eliminando ${project.files.length} archivo(s) ZIP...`);
                project.files.forEach(file => {
                    const filePath = path.join(__dirname, '../uploads/project-files/', file.filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                });
            }

            await models.Project.findByIdAndDelete(projectId);
            console.log('✅ Proyecto eliminado exitosamente');

            res.status(200).json({
                message: "EL PROYECTO SE ELIMINÓ CORRECTAMENTE",
                code: 200
            });
        } catch (error) {
            console.error('❌ Error al eliminar proyecto:', error);
            res.status(500).send({
                message: "HUBO UN ERROR"
            });
        }
    };
export const uploadFiles = async (req, res) => {
        try {
            const projectId = req.params.id;
            const project = await models.Project.findById(projectId);

            if (!project) {
                return res.status(404).json({ message: 'Proyecto no encontrado' });
            }

            // Verificación de permisos: un instructor solo puede subir archivos a sus propios proyectos.
            if (req.user.rol === 'instructor' && project.user.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'No tienes permiso para subir archivos a este proyecto.' });
            }

            if (!req.files || Object.keys(req.files).length === 0) {
                return res.status(400).json({ message: 'No se enviaron archivos' });
            }

            const uploadedFiles = [];
            const errors = [];

            // Procesar cada archivo
            for (const key in req.files) {
                const file = req.files[key];
                const fileArray = Array.isArray(file) ? file : [file];

                for (const singleFile of fileArray) {
                    // Validar extensión ZIP
                    const ext = path.extname(singleFile.originalFilename || singleFile.name).toLowerCase();
                    if (ext !== '.zip') {
                        errors.push(`${singleFile.originalFilename || singleFile.name}: Solo se permiten archivos ZIP`);
                        // Eliminar archivo si no es ZIP
                        if (fs.existsSync(singleFile.path)) {
                            fs.unlinkSync(singleFile.path);
                        }
                        continue;
                    }

                    // Validar tamaño
                    const fileSize = singleFile.size;
                    if (fileSize > MAX_FILE_SIZE) {
                        errors.push(`${singleFile.originalFilename || singleFile.name}: Excede el tamaño máximo de 50MB`);
                        // Eliminar archivo si excede tamaño
                        if (fs.existsSync(singleFile.path)) {
                            fs.unlinkSync(singleFile.path);
                        }
                        continue;
                    }

                    // Generar nombre único para el archivo
                    const originalName = singleFile.originalFilename || singleFile.name;
                    const timestamp = Date.now();
                    const randomString = Math.random().toString(36).substring(2, 8);
                    const uniqueFilename = `${timestamp}-${randomString}${ext}`;

                    // Mover archivo a la carpeta correcta
                    const oldPath = singleFile.path;
                    const newPath = path.join(__dirname, '../uploads/project-files/', uniqueFilename);

                    fs.renameSync(oldPath, newPath);

                    // Agregar información del archivo al array
                    uploadedFiles.push({
                        name: originalName,
                        filename: uniqueFilename,
                        size: fileSize,
                        uploadDate: new Date()
                    });
                }
            }

            // Actualizar proyecto con los nuevos archivos
            if (uploadedFiles.length > 0) {
                project.files = project.files || [];
                project.files.push(...uploadedFiles);
                await project.save();
            }

            res.status(200).json({
                message: 'Archivos procesados',
                uploadedFiles: uploadedFiles.length,
                errors: errors.length > 0 ? errors : undefined,
                files: project.files
            });

        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR AL SUBIR LOS ARCHIVOS"
            });
        }
    };
export const removeFile = async (req, res) => {
        try {
            const { projectId, fileId } = req.params;
            const project = await models.Project.findById(projectId);

            if (!project) {
                return res.status(404).json({ message: 'Proyecto no encontrado' });
            }

            // Verificación de permisos
            if (req.user.rol === 'instructor' && project.user.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'No tienes permiso para eliminar archivos de este proyecto.' });
            }

            // Buscar el archivo en el proyecto
            const fileIndex = project.files.findIndex(f => f._id.toString() === fileId);
            
            if (fileIndex === -1) {
                return res.status(404).json({ message: 'Archivo no encontrado' });
            }

            const fileToDelete = project.files[fileIndex];

            // Eliminar archivo físico
            const filePath = path.join(__dirname, '../uploads/project-files/', fileToDelete.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Eliminar referencia del array
            project.files.splice(fileIndex, 1);
            await project.save();

            res.status(200).json({
                message: 'Archivo eliminado correctamente',
                files: project.files
            });

        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR AL ELIMINAR EL ARCHIVO"
            });
        }
    };
export const downloadFile = async (req, res) => {
        try {
            // El middleware 'auth.verifyTienda' ya ha verificado el token y adjuntado el usuario a req.user
            const { projectId, filename } = req.params;

            // 1. Verificar que el usuario ha comprado el proyecto.
            const hasPurchased = await models.Sale.findOne({
                user: req.user._id,
                status: 'Pagado',
                'detail.product': projectId,
                'detail.product_type': 'project'
            });

            if (!hasPurchased) {
                return res.status(403).json({ message: 'No tienes permiso para descargar este archivo.' });
            }

            // 2. Buscar el proyecto y el archivo específico.
            const project = await models.Project.findOne({ _id: projectId, 'files.filename': filename });
            if (!project) {
                return res.status(404).json({ message: 'Proyecto o archivo no encontrado.' });
            }

            const file = project.files.find(f => f.filename === filename);
            const filePath = path.join(__dirname, '../uploads/project-files/', filename);

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ message: 'Archivo físico no encontrado' });
            }

            // 3. Enviar el archivo para su descarga con su nombre original.
            res.download(filePath, file.name); // El segundo argumento establece el nombre del archivo para el cliente.

        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "HUBO UN ERROR AL DESCARGAR EL ARCHIVO"
            });
        }
    };

// GET /api/project/imagen-project/:img
export const get_imagen = async (req, res) => {
    try {
        const img = req.params["img"];
        const imagePath = path.join(__dirname, '../uploads/project/', img);
        const defaultImagePath = path.join(__dirname, '../uploads/default.jpg');

        if (fs.existsSync(imagePath)) {
            res.status(200).sendFile(path.resolve(imagePath));
        } else {
            res.status(200).sendFile(path.resolve(defaultImagePath));
        }
    } catch (error) {
        res.status(500).send({ message: "HUBO UN ERROR AL OBTENER LA IMAGEN" });
    }
};

// GET /api/project/list-settings
export const list_settings = async (req, res) => {
    try {
        // Obtenemos todos los proyectos, seleccionando solo los campos necesarios.
        const projects = await models.Project.find({}, { title: 1, subtitle: 1, imagen: 1, price_usd: 1, featured: 1 });

        res.status(200).json({
            projects: projects // Devolvemos la propiedad 'projects' que el frontend espera
        });

    } catch (error) {
        console.log(error);
        res.status(500).send({
            message: 'HUBO UN ERROR'
        });
    }
};


// PUT /api/project/toggle-featured/:id
export const toggle_featured = async (req, res) => {
    try {
        const projectId = req.params.id;
        const project = await models.Project.findById(projectId);

        if (!project) {
            return res.status(404).json({ message: 'Proyecto no encontrado' });
        }

        // Cambia el estado de 'featured' al valor que viene del frontend
        project.featured = req.body.is_featured;
        await project.save();

        res.status(200).json({
            message: `El proyecto ha sido ${project.featured ? 'marcado como destacado' : 'desmarcado'}.`,
            // Devolvemos el proyecto con el mismo formato que 'list-settings'
            project: {
                _id: project._id,
                title: project.title,
                subtitle: project.subtitle,
                imagen: project.imagen,
                price_usd: project.price_usd,
                // No hay slug en el modelo de proyecto, así que no lo incluimos
                featured: project.featured
            }
        });
    } catch (error) {
        res.status(500).send({ message: "HUBO UN ERROR" });
    }
};
