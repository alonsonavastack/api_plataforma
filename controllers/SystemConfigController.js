import SystemConfig from '../models/SystemConfig.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupportedCountries, getExchangeRate } from '../services/exchangeRate.service.js'; // 🔥 IMPORTAR PAÍSES SOPORTADOS Y TASA

// 🔥 FIX: Obtener __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Obtener configuración pública (sin autenticación)
const getPublic = async (req, res) => {
  try {
    console.log('📋 [SystemConfigController] Obteniendo configuración pública');

    let config = await SystemConfig.findOne();

    // Si no existe, crear configuración por defecto
    if (!config) {
      console.log('⚠️ [SystemConfigController] No existe configuración, usando valores por defecto');
      // Retornar valores por defecto sin guardar en BD
      return res.status(200).send({
        config: {
          siteName: 'NeoCourse',
          siteDescription: 'Plataforma de Cursos Online',
          logo: null,
          favicon: null,
          email: '',
          phone: '',
          supportEmail: '',
          socialMedia: {
            facebook: '',
            instagram: '',
            youtube: '',
            tiktok: '',
            twitch: '',
            twitter: '',
            linkedin: '',
            website: ''
          },
          metaKeywords: '',
          metaDescription: '',
          maintenanceMode: false,
          allowRegistrations: true,
          modules: {
            courses: true
          }
        }
      });
    }

    // Obtener tipo de cambio actual
    const rate = await getExchangeRate();
    console.log('✅ [SystemConfigController] Configuración pública obtenida:', config.siteName);
    console.log('💱 [SystemConfigController] Tipo de cambio incluido:', rate);

    res.status(200).send({
      config: config,
      exchange_rate: rate // 🔥 EXPORNER TASA DE CAMBIO
    });

  } catch (error) {
    console.error('❌ [SystemConfigController] Error al obtener configuración pública:', error);
    res.status(500).send({
      message: 'Error al obtener la configuración del sistema'
    });
  }
};

// Obtener configuración actual (solo hay una)
const get = async (req, res) => {
  try {
    console.log('📋 [SystemConfigController] Obteniendo configuración del sistema');

    let config = await SystemConfig.findOne();

    // Si no existe, crear configuración por defecto
    if (!config) {
      console.log('⚠️ [SystemConfigController] No existe configuración, creando por defecto');
      config = new SystemConfig({
        siteName: 'NeoCourse',
        siteDescription: 'Plataforma de Cursos Online',
        email: 'admin@neocourse.com',
        updatedBy: req.user.sub
      });
      await config.save();
    }

    console.log('✅ [SystemConfigController] Configuración obtenida:', config.siteName);

    res.status(200).send({
      config: config
    });

  } catch (error) {
    console.error('❌ [SystemConfigController] Error al obtener configuración:', error);
    res.status(500).send({
      message: 'Error al obtener la configuración del sistema'
    });
  }
};

// Actualizar configuración
const update = async (req, res) => {
  try {
    console.log('🔄 [SystemConfigController] Actualizando configuración');
    console.log('📦 Datos recibidos:', req.body);

    // 🔥 CREAR DIRECTORIO uploads/system SI NO EXISTE
    const systemDir = path.join(__dirname, '../uploads/system');
    if (!fs.existsSync(systemDir)) {
      console.log('📁 Creando directorio:', systemDir);
      fs.mkdirSync(systemDir, { recursive: true });
    }

    let config = await SystemConfig.findOne();

    if (!config) {
      console.log('⚠️ [SystemConfigController] No existe configuración, creando nueva');
      config = new SystemConfig();
    }

    // Actualizar campos básicos
    if (req.body.siteName) config.siteName = req.body.siteName;
    if (req.body.siteDescription) config.siteDescription = req.body.siteDescription;
    if (req.body.email) config.email = req.body.email;
    if (req.body.phone !== undefined) config.phone = req.body.phone;
    if (req.body.supportEmail !== undefined) config.supportEmail = req.body.supportEmail;

    // Actualizar redes sociales (campos planos → objeto anidado)
    if (req.body.facebook !== undefined || req.body.instagram !== undefined ||
      req.body.youtube !== undefined || req.body.tiktok !== undefined ||
      req.body.twitch !== undefined || req.body.twitter !== undefined ||
      req.body.linkedin !== undefined || req.body.website !== undefined) {

      config.socialMedia = {
        facebook: req.body.facebook || '',
        instagram: req.body.instagram || '',
        youtube: req.body.youtube || '',
        tiktok: req.body.tiktok || '',
        twitch: req.body.twitch || '',
        twitter: req.body.twitter || '',
        linkedin: req.body.linkedin || '',
        website: req.body.website || ''
      };
    }

    // Actualizar SEO
    if (req.body.metaKeywords !== undefined) config.metaKeywords = req.body.metaKeywords;
    if (req.body.metaDescription !== undefined) config.metaDescription = req.body.metaDescription;

    // Actualizar configuración de sistema
    if (req.body.maintenanceMode !== undefined) config.maintenanceMode = req.body.maintenanceMode;
    if (req.body.allowRegistrations !== undefined) config.allowRegistrations = req.body.allowRegistrations;

    // Actualizar módulos
    // Inicializar si no existe
    if (!config.modules) config.modules = { courses: true };

    if (req.body.modules_courses !== undefined) {
      config.modules.courses = req.body.modules_courses;
    } else if (req.body.modules && req.body.modules.courses !== undefined) {
      // Soporte para objeto anidado
      config.modules.courses = req.body.modules.courses;
    }

    // Manejar logo
    if (req.files && req.files.logo) {
      const logoFile = req.files.logo;

      // 🔥 Asegurar que el directorio existe
      const systemDir = path.join(__dirname, '../uploads/system');
      if (!fs.existsSync(systemDir)) {
        console.log('📁 Creando directorio para logo:', systemDir);
        fs.mkdirSync(systemDir, { recursive: true });
      }

      // Eliminar logo anterior si existe
      if (config.logo) {
        const oldLogoPath = path.join(__dirname, '../uploads/system', config.logo);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
          console.log('🗑️ Logo anterior eliminado');
        }
      }

      // Guardar nuevo logo
      const logoExt = path.extname(logoFile.path);
      const logoName = `logo-${Date.now()}${logoExt}`;
      const logoPath = path.join(__dirname, '../uploads/system', logoName);

      // 🔥 Validar tamaño de archivo (10MB máximo)
      const maxSize = 10 * 1024 * 1024; // 10MB
      const stats = fs.statSync(logoFile.path);
      if (stats.size > maxSize) {
        // Eliminar archivo temporal
        fs.unlinkSync(logoFile.path);
        return res.status(400).send({
          message: 'El archivo es demasiado grande',
          error: `El tamaño máximo permitido es 10MB (${(stats.size / (1024 * 1024)).toFixed(2)}MB recibido)`
        });
      }

      fs.renameSync(logoFile.path, logoPath);
      config.logo = logoName;
      console.log('✅ Logo guardado:', logoName, `(${(stats.size / (1024 * 1024)).toFixed(2)}MB)`);
    }

    // Manejar favicon
    if (req.files && req.files.favicon) {
      const faviconFile = req.files.favicon;

      // 🔥 Asegurar que el directorio existe
      const systemDir = path.join(__dirname, '../uploads/system');
      if (!fs.existsSync(systemDir)) {
        console.log('📁 Creando directorio para favicon:', systemDir);
        fs.mkdirSync(systemDir, { recursive: true });
      }

      // Eliminar favicon anterior si existe
      if (config.favicon) {
        const oldFaviconPath = path.join(__dirname, '../uploads/system', config.favicon);
        if (fs.existsSync(oldFaviconPath)) {
          fs.unlinkSync(oldFaviconPath);
          console.log('🗑️ Favicon anterior eliminado');
        }
      }

      // Guardar nuevo favicon
      const faviconExt = path.extname(faviconFile.path);
      const faviconName = `favicon-${Date.now()}${faviconExt}`;
      const faviconPath = path.join(__dirname, '../uploads/system', faviconName);

      // 🔥 Validar tamaño de archivo (10MB máximo)
      const maxSize = 10 * 1024 * 1024; // 10MB
      const stats = fs.statSync(faviconFile.path);
      if (stats.size > maxSize) {
        // Eliminar archivo temporal
        fs.unlinkSync(faviconFile.path);
        return res.status(400).send({
          message: 'El archivo es demasiado grande',
          error: `El tamaño máximo permitido es 10MB (${(stats.size / (1024 * 1024)).toFixed(2)}MB recibido)`
        });
      }

      fs.renameSync(faviconFile.path, faviconPath);
      config.favicon = faviconName;
      console.log('✅ Favicon guardado:', faviconName, `(${(stats.size / (1024 * 1024)).toFixed(2)}MB)`);
    }

    // Auditoría
    config.updatedBy = req.user.sub;
    config.updatedAt = Date.now();

    await config.save();

    console.log('✅ [SystemConfigController] Configuración actualizada exitosamente');

    res.status(200).send({
      message: 'Configuración actualizada exitosamente',
      config: config
    });

  } catch (error) {
    console.error('❌ [SystemConfigController] Error al actualizar:', error);
    res.status(500).send({
      message: 'Error al actualizar la configuración',
      error: error.message
    });
  }
};

// Obtener imagen del logo
const getLogo = async (req, res) => {
  try {
    const img = req.params['img'];
    const imgPath = path.join(__dirname, '../uploads/system', img);

    if (fs.existsSync(imgPath)) {
      res.sendFile(imgPath);
    } else {
      res.status(404).send({ message: 'Imagen no encontrada' });
    }
  } catch (error) {
    console.error('❌ Error al obtener logo:', error);
    res.status(500).send({ message: 'Error al obtener la imagen' });
  }
};

// Obtener favicon
const getFavicon = async (req, res) => {
  try {
    const img = req.params['img'];
    const imgPath = path.join(__dirname, '../uploads/system', img);

    if (fs.existsSync(imgPath)) {
      res.sendFile(imgPath);
    } else {
      res.status(404).send({ message: 'Imagen no encontrada' });
    }
  } catch (error) {
    console.error('❌ Error al obtener favicon:', error);
    res.status(500).send({ message: 'Error al obtener la imagen' });
  }
};

// 🔍 DEBUG: Ver configuración actual en BD (TEMPORAL)
const debug = async (req, res) => {
  try {
    console.log('🔍 [SystemConfigController] DEBUG - Verificando BD');

    const config = await SystemConfig.findOne();

    if (!config) {
      return res.status(200).send({
        message: 'No hay configuración en la BD',
        config: null
      });
    }

    return res.status(200).send({
      message: 'Configuración encontrada',
      config: {
        _id: config._id,
        siteName: config.siteName,
        siteDescription: config.siteDescription,
        logo: config.logo,
        favicon: config.favicon,
        email: config.email,
        phone: config.phone,
        supportEmail: config.supportEmail,
        socialMedia: config.socialMedia,
        metaKeywords: config.metaKeywords,
        metaDescription: config.metaDescription,
        maintenanceMode: config.maintenanceMode,
        allowRegistrations: config.allowRegistrations,
        createdAt: config.createdAt,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        modules: config.modules || { courses: true }
      },
      raw: config.toObject() // Objeto completo sin filtros
    });
  } catch (error) {
    console.error('❌ [SystemConfigController] Error en debug:', error);
    res.status(500).send({
      message: 'Error al obtener configuración',
      error: error.message
    });
  }
};

// 🌎 OBTENER PAÍSES SOPORTADOS PARA PAGOS
const getSupportedCountriesEndpoint = async (req, res) => {
  try {
    console.log('🌎 [SystemConfigController] Obteniendo países soportados');

    const countries = getSupportedCountries();

    res.status(200).send({
      success: true,
      countries
    });
  } catch (error) {
    console.error('❌ [SystemConfigController] Error al obtener países:', error);
    res.status(500).send({
      success: false,
      message: 'Error al obtener países soportados',
      error: error.message
    });
  }
};

export {
  get,
  getPublic,
  debug,
  update,
  getLogo,
  getFavicon,
  getSupportedCountriesEndpoint
};