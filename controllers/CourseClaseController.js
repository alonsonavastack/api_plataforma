import models from '../models/index.js';
import axios from 'axios';

export const register = async (req, res) => {
  try {
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
    res.status(200).json({ duration: response.data.duration }); // Devuelve la duración en segundos
  } catch (error) {
    // Log del error para depuración en el servidor
    console.error("Error al obtener datos de Vimeo:", error.response ? error.response.data : error.message);
    // Enviar una respuesta de error más específica al frontend
    const status = error.response ? error.response.status : 500;
    const message = status === 404 ? 'El video no fue encontrado en Vimeo.' : 'No se pudieron obtener los datos del video desde Vimeo.';
    res.status(status).json({ message });
  }
};