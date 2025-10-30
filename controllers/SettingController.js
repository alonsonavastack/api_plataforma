import models from "../models/index.js";
import multiparty from "connect-multiparty";
import fs from "fs";
import path from "path";

// Configuración de multiparty para subir archivos
const path_uploads = multiparty({ uploadDir: './uploads/settings' });

export default {
  /**
   * 📋 Obtener toda la configuración del sistema (para uso interno)
   */
  getSettings: async () => {
    try {
      const settings = await models.Setting.find();
      
      // Formatear como objeto plano key: value
      const formattedSettings = {};
      settings.forEach(setting => {
        formattedSettings[setting.key] = setting.value;
      });

      return formattedSettings;
    } catch (error) {
      console.error('❌ [SETTINGS] Error al obtener configuración:', error);
      return {};
    }
  },

  /**
   * 📋 Obtener toda la configuración del sistema (endpoint API)
   */
  getAll: async (req, res) => {
    try {
      console.log('📋 [SETTINGS] Obteniendo configuración del sistema');

      const settings = await models.Setting.find().sort({ group: 1, key: 1 });

      // Formatear respuesta agrupada
      const formattedSettings = {};
      settings.forEach(setting => {
        formattedSettings[setting.key] = {
          value: setting.value,
          name: setting.name,
          description: setting.description,
          group: setting.group
        };
      });

      console.log('✅ [SETTINGS] Configuración obtenida:', Object.keys(formattedSettings));

      res.status(200).json({
        success: true,
        settings: formattedSettings
      });

    } catch (error) {
      console.error('❌ [SETTINGS] Error al obtener configuración:', error);
      res.status(500).json({
        success: false,
        message: "Error al obtener la configuración",
        message_text: "Ocurrió un error al cargar la configuración del sistema"
      });
    }
  },

  /**
   * 📝 Actualizar configuración del sistema (sin logo)
   */
  update: async (req, res) => {
    try {
      console.log('📝 [SETTINGS] Actualizando configuración:', req.body);

      const updates = req.body;
      const results = [];

      // Actualizar o crear cada configuración
      for (const [key, value] of Object.entries(updates)) {
        // Saltar campos que no son configuraciones
        if (key === 'logo' || key === 'currentLogo') continue;

        const setting = await models.Setting.findOneAndUpdate(
          { key },
          { 
            key,
            value,
            name: getSettingName(key),
            description: getSettingDescription(key),
            group: getSettingGroup(key)
          },
          { upsert: true, new: true }
        );

        results.push(setting);
      }

      console.log('✅ [SETTINGS] Configuración actualizada:', results.length, 'registros');

      res.status(200).json({
        success: true,
        message: "Configuración actualizada exitosamente",
        settings: results
      });

    } catch (error) {
      console.error('❌ [SETTINGS] Error al actualizar configuración:', error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar la configuración",
        message_text: "Ocurrió un error al guardar la configuración"
      });
    }
  },

  /**
   * 🖼️ Actualizar logo del sistema
   */
  updateLogo: async (req, res) => {
    try {
      console.log('🖼️ [SETTINGS] Actualizando logo del sistema');

      if (!req.files || !req.files.logo) {
        return res.status(400).json({
          success: false,
          message: "No se envió ningún archivo",
          message_text: "Debes seleccionar una imagen para el logo"
        });
      }

      const file = req.files.logo;
      const file_ext = path.extname(file.originalFilename).toLowerCase();
      const valid_extensions = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

      // Validar extensión
      if (!valid_extensions.includes(file_ext)) {
        fs.unlinkSync(file.path); // Eliminar archivo inválido
        return res.status(400).json({
          success: false,
          message: "Formato de archivo no válido",
          message_text: "Solo se permiten imágenes (PNG, JPG, JPEG, WEBP, SVG)"
        });
      }

      // Validar tamaño (máximo 2MB)
      const maxSize = 2 * 1024 * 1024; // 2MB
      if (file.size > maxSize) {
        fs.unlinkSync(file.path);
        return res.status(400).json({
          success: false,
          message: "Archivo muy grande",
          message_text: "El logo no puede superar los 2MB"
        });
      }

      // Obtener logo actual para eliminarlo
      const currentLogo = await models.Setting.findOne({ key: 'logo' });
      if (currentLogo && currentLogo.value) {
        const oldPath = `./uploads/settings/${currentLogo.value}`;
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
          console.log('🗑️ [SETTINGS] Logo anterior eliminado');
        }
      }

      // Generar nombre único para el archivo
      const filename = `logo_${Date.now()}${file_ext}`;
      const newPath = `./uploads/settings/${filename}`;

      // Asegurar que existe el directorio
      const uploadsDir = './uploads/settings';
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Mover archivo a la ubicación final
      fs.renameSync(file.path, newPath);

      // Actualizar en base de datos
      const setting = await models.Setting.findOneAndUpdate(
        { key: 'logo' },
        { 
          key: 'logo',
          value: filename,
          name: 'Logo de la plataforma',
          description: 'Logotipo principal que se muestra en el sistema',
          group: 'general'
        },
        { upsert: true, new: true }
      );

      console.log('✅ [SETTINGS] Logo actualizado:', filename);

      res.status(200).json({
        success: true,
        message: "Logo actualizado exitosamente",
        filename: filename,
        setting: setting
      });

    } catch (error) {
      console.error('❌ [SETTINGS] Error al actualizar logo:', error);
      res.status(500).json({
        success: false,
        message: "Error al actualizar el logo",
        message_text: "Ocurrió un error al subir la imagen"
      });
    }
  },

  /**
   * 🖼️ Obtener imagen del logo
   */
  getLogo: async (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = `./uploads/settings/${filename}`;

      if (!fs.existsSync(filePath)) {
        console.warn('⚠️ [SETTINGS] Logo no encontrado:', filename);
        return res.status(404).json({
          success: false,
          message: "Logo no encontrado"
        });
      }

      res.sendFile(path.resolve(filePath));

    } catch (error) {
      console.error('❌ [SETTINGS] Error al obtener logo:', error);
      res.status(500).json({
        success: false,
        message: "Error al obtener el logo"
      });
    }
  },

  /**
   * 🗑️ Eliminar logo del sistema
   */
  deleteLogo: async (req, res) => {
    try {
      console.log('🗑️ [SETTINGS] Eliminando logo del sistema');

      const currentLogo = await models.Setting.findOne({ key: 'logo' });
      
      if (!currentLogo || !currentLogo.value) {
        return res.status(404).json({
          success: false,
          message: "No hay logo configurado",
          message_text: "No existe un logo para eliminar"
        });
      }

      // Eliminar archivo físico
      const filePath = `./uploads/settings/${currentLogo.value}`;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('✅ [SETTINGS] Archivo de logo eliminado');
      }

      // Eliminar de base de datos
      await models.Setting.deleteOne({ key: 'logo' });

      console.log('✅ [SETTINGS] Logo eliminado de la base de datos');

      res.status(200).json({
        success: true,
        message: "Logo eliminado exitosamente"
      });

    } catch (error) {
      console.error('❌ [SETTINGS] Error al eliminar logo:', error);
      res.status(500).json({
        success: false,
        message: "Error al eliminar el logo",
        message_text: "Ocurrió un error al eliminar la imagen"
      });
    }
  },

  /**
   * 🔄 Restablecer configuración por defecto
   */
  reset: async (req, res) => {
    try {
      console.log('🔄 [SETTINGS] Restableciendo configuración por defecto');

      // Configuración por defecto
      const defaultSettings = [
        {
          key: 'platform_name',
          value: 'Dev-Sharks',
          name: 'Nombre de la plataforma',
          description: 'Nombre principal que se muestra en el sistema',
          group: 'general'
        },
        {
          key: 'contact_email',
          value: 'contacto@Dev-Sharks.com',
          name: 'Email de contacto',
          description: 'Correo electrónico principal de contacto',
          group: 'contact'
        },
        {
          key: 'contact_phone',
          value: '',
          name: 'Teléfono de contacto',
          description: 'Número de teléfono de contacto',
          group: 'contact'
        },
        {
          key: 'social_facebook',
          value: '',
          name: 'Facebook',
          description: 'URL del perfil de Facebook',
          group: 'social'
        },
        {
          key: 'social_instagram',
          value: '',
          name: 'Instagram',
          description: 'URL del perfil de Instagram',
          group: 'social'
        },
        {
          key: 'social_youtube',
          value: '',
          name: 'YouTube',
          description: 'URL del canal de YouTube',
          group: 'social'
        },
        {
          key: 'social_tiktok',
          value: '',
          name: 'TikTok',
          description: 'URL del perfil de TikTok',
          group: 'social'
        },
        {
          key: 'social_twitter',
          value: '',
          name: 'Twitter/X',
          description: 'URL del perfil de Twitter/X',
          group: 'social'
        },
        {
          key: 'social_linkedin',
          value: '',
          name: 'LinkedIn',
          description: 'URL del perfil de LinkedIn',
          group: 'social'
        },
        // Configuraciones de visibilidad del home
        {
          key: 'home_show_featured_courses',
          value: true,
          name: 'Mostrar cursos destacados en Home',
          description: 'Controla si se muestran los cursos destacados en la página principal',
          group: 'home'
        },
        {
          key: 'home_show_featured_projects',
          value: true,
          name: 'Mostrar proyectos destacados en Home',
          description: 'Controla si se muestran los proyectos destacados en la página principal',
          group: 'home'
        }
      ];

      // Eliminar toda la configuración actual (excepto logo)
      await models.Setting.deleteMany({ key: { $ne: 'logo' } });

      // Insertar configuración por defecto
      await models.Setting.insertMany(defaultSettings);

      console.log('✅ [SETTINGS] Configuración restablecida a valores por defecto');

      res.status(200).json({
        success: true,
        message: "Configuración restablecida exitosamente",
        settings: defaultSettings
      });

    } catch (error) {
      console.error('❌ [SETTINGS] Error al restablecer configuración:', error);
      res.status(500).json({
        success: false,
        message: "Error al restablecer la configuración",
        message_text: "Ocurrió un error al restablecer los valores"
      });
    }
  }
};

// 🔧 Funciones helper para obtener metadata de configuraciones
function getSettingName(key) {
  const names = {
    platform_name: 'Nombre de la plataforma',
    contact_email: 'Email de contacto',
    contact_phone: 'Teléfono de contacto',
    social_facebook: 'Facebook',
    social_instagram: 'Instagram',
    social_youtube: 'YouTube',
    social_tiktok: 'TikTok',
    social_twitter: 'Twitter/X',
    social_linkedin: 'LinkedIn',
    home_show_featured_courses: 'Mostrar cursos destacados en Home',
    home_show_featured_projects: 'Mostrar proyectos destacados en Home'
  };
  return names[key] || key;
}

function getSettingDescription(key) {
  const descriptions = {
    platform_name: 'Nombre principal que se muestra en el sistema',
    contact_email: 'Correo electrónico principal de contacto',
    contact_phone: 'Número de teléfono de contacto',
    social_facebook: 'URL del perfil de Facebook',
    social_instagram: 'URL del perfil de Instagram',
    social_youtube: 'URL del canal de YouTube',
    social_tiktok: 'URL del perfil de TikTok',
    social_twitter: 'URL del perfil de Twitter/X',
    social_linkedin: 'URL del perfil de LinkedIn',
    home_show_featured_courses: 'Controla si se muestran los cursos destacados en la página principal',
    home_show_featured_projects: 'Controla si se muestran los proyectos destacados en la página principal'
  };
  return descriptions[key] || '';
}

function getSettingGroup(key) {
  if (key.startsWith('social_')) return 'social';
  if (key.startsWith('contact_')) return 'contact';
  if (key.startsWith('home_')) return 'home';
  return 'general';
}

export { path_uploads };
