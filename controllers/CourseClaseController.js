import models from '../models/index.js';
import axios from 'axios';

export const register = async (req, res) => {
  try {
    // --- INICIO DE LA LÓGICA DE UPLOAD DE ARCHIVOS ---
    if (req.files && req.files.files) {
      // Esta lógica asume que tienes un controlador o middleware para manejar la subida de archivos
      // y que los nombres de los archivos se añadirán a req.body.files_name o similar.
      // Por ahora, nos enfocamos en la eliminación segura.
    }
    // Crea la nueva clase con los datos recibidos
    const newClass = await models.CourseClase.create(req.body);

    // Actualiza el contador de clases en la sección correspondiente
    await models.CourseSection.findByIdAndUpdate(
      req.body.section,
      { $inc: { num_clases: 1 } }
    );

    res.status(201).json(newClass);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear la clase', error });
  }
};

export const list = async (req, res) => {
  try {
    const sectionId = req.query.section_id;
    const classes = await models.CourseClase.find({ section: sectionId }).sort({ order: 1 });
    res.status(200).json(classes);
  } catch (error) {
    res.status(500).json({ message: 'Error al listar las clases', error });
  }
};

export const update = async (req, res) => {
  try {
    const { _id, ...data } = req.body;
    const updatedClass = await models.CourseClase.findByIdAndUpdate(_id, data, { new: true });
    if (!updatedClass) {
      return res.status(404).json({ message: 'Clase no encontrada' });
    }
    res.status(200).json(updatedClass);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar la clase', error });
  }
};

export const remove = async (req, res) => {
  try {
    const classId = req.params.id;
    const deletedClass = await models.CourseClase.findByIdAndDelete(classId);
    if (!deletedClass) {
      return res.status(404).json({ message: 'Clase no encontrada' });
    }

    // --- INICIO DE LA LÓGICA AÑADIDA ---
    // 1. Buscar y eliminar todos los archivos asociados a esta clase.
    const claseFiles = await models.CourseClaseFile.find({ clase: classId });
    for (const file of claseFiles) {
      // Construir la ruta al archivo físico
      const filePath = path.join(__dirname, '../uploads/course/files/', file.file);
      // Eliminar el archivo del servidor si existe
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    // 2. Eliminar los registros de la base de datos.
    await models.CourseClaseFile.deleteMany({ clase: classId });
    // --- FIN DE LA LÓGICA AÑADIDA ---

    // Decrementa el contador de clases en la sección padre
    await models.CourseSection.findByIdAndUpdate(deletedClass.section, { $inc: { num_clases: -1 } });

    res.status(200).json({ message: 'Clase eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar la clase', error });
  }
};

export const reorder = async (req, res) => {
  try {
    const { ids } = req.body;
    // Usamos una operación masiva para actualizar el orden de todas las clases de una vez
    const bulkOps = ids.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index } },
      },
    }));
    await models.CourseClase.bulkWrite(bulkOps);
    res.status(200).json({ message: 'Orden de las clases actualizado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al reordenar las clases', error });
  }
};

export const get_vimeo_data = async (req, res) => {
  try {
    const vimeoUrl = req.query.url;
    if (!vimeoUrl) {
      return res.status(400).json({ message: 'No se proporcionó una URL de Vimeo.' });
    }

    // Extraer el ID del video de la URL
    const match = vimeoUrl.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
    if (!match) {
      return res.status(400).json({ message: 'URL de Vimeo no válida.' });
    }
    const videoId = match[1];

    const vimeoApiUrl = `https://api.vimeo.com/videos/${videoId}`;
    const vimeoToken = process.env.VIMEO_TOKEN;

    if (!vimeoToken) {
      console.error('VIMEO_TOKEN no está configurado en el archivo .env');
      return res.status(500).json({ message: 'Error de configuración del servidor: falta el token de Vimeo.' });
    }

    const response = await axios.get(vimeoApiUrl, {
      headers: {
        'Authorization': `Bearer ${vimeoToken}`
      }
    });
    res.status(200).json({ 
      duration: response.data.duration,
      video_id: videoId 
    }); // Devuelve la duración en segundos y el ID
  } catch (error) {
    // Log del error para depuración en el servidor
    console.error("Error al obtener datos de Vimeo:", error.response ? error.response.data : error.message);
    // Enviar una respuesta de error más específica al frontend
    const status = error.response ? error.response.status : 500;
    const message = status === 404 ? 'El video no fue encontrado en Vimeo.' : 'No se pudieron obtener los datos del video desde Vimeo.';
    res.status(status).json({ message });
  }
};

// 🎬 NUEVO: Obtener datos de YouTube
export const get_youtube_data = async (req, res) => {
  try {
    const youtubeUrl = req.query.url;
    if (!youtubeUrl) {
      return res.status(400).json({ message: 'No se proporcionó una URL de YouTube.' });
    }

    // Extraer el ID del video de YouTube (soporta múltiples formatos)
    const videoIdMatch = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&?/]+)/);
    if (!videoIdMatch) {
      return res.status(400).json({ message: 'URL de YouTube no válida.' });
    }
    const videoId = videoIdMatch[1];

    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (!youtubeApiKey) {
      console.error('YOUTUBE_API_KEY no está configurado en el archivo .env');
      return res.status(500).json({ message: 'Error de configuración del servidor: falta la API Key de YouTube.' });
    }

    // Llamar a la API de YouTube Data v3
    const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails,snippet&key=${youtubeApiKey}`;
    
    const response = await axios.get(youtubeApiUrl);
    
    if (!response.data.items || response.data.items.length === 0) {
      return res.status(404).json({ message: 'Video no encontrado en YouTube.' });
    }

    // Parsear la duración ISO 8601 (ej: PT1H2M10S)
    const duration = response.data.items[0].contentDetails.duration;
    const seconds = parseISO8601Duration(duration);

    res.status(200).json({ 
      duration: seconds,
      video_id: videoId,
      title: response.data.items[0].snippet.title
    });
  } catch (error) {
    console.error("Error al obtener datos de YouTube:", error.response ? error.response.data : error.message);
    const status = error.response ? error.response.status : 500;
    let message = 'No se pudieron obtener los datos del video desde YouTube.';
    
    if (status === 403) {
      message = 'Error de autenticación con YouTube API. Verifica tu API Key en el archivo .env';
    } else if (status === 404) {
      message = 'El video no fue encontrado en YouTube.';
    }
    
    res.status(status).json({ message });
  }
};

// 🛠️ Función helper para convertir ISO 8601 a segundos
function parseISO8601Duration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  
  return hours * 3600 + minutes * 60 + seconds;
}