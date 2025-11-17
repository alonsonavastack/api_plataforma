import models from "../models/index.js";
import crypto from "crypto";

// Generar código corto único (6 caracteres)
function generateShortCode() {
  return crypto.randomBytes(3).toString('hex'); // Genera 6 caracteres hex
}

// Verificar si el código ya existe
async function isCodeUnique(code) {
  const existing = await models.ShortUrl.findOne({ shortCode: code });
  return !existing;
}

// Generar código único con reintentos
async function generateUniqueCode() {
  let code;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = generateShortCode();
    attempts++;
    
    if (await isCodeUnique(code)) {
      return code;
    }
  } while (attempts < maxAttempts);

  // Si no se encontró código único, agregar timestamp
  return `${code}${Date.now().toString(36).slice(-2)}`;
}

export default {
  // Crear o obtener short URL
  createOrGet: async (req, res) => {
    try {
      const { originalUrl, resourceType, resourceId } = req.body;

      if (!originalUrl) {
        return res.status(400).json({
          message: 400,
          message_text: "La URL original es requerida"
        });
      }

      console.log('🔗 [ShortUrl] Creando short URL para:', originalUrl);

      // Verificar si ya existe un short URL para esta URL
      let shortUrl = await models.ShortUrl.findOne({
        originalUrl,
        isActive: true
      });

      if (shortUrl) {
        console.log('✅ [ShortUrl] Short URL ya existe:', shortUrl.shortCode);
        return res.status(200).json({
          shortUrl: {
            shortCode: shortUrl.shortCode,
            originalUrl: shortUrl.originalUrl,
            fullShortUrl: `${req.protocol}://${req.get('host')}/s/${shortUrl.shortCode}`,
            clicks: shortUrl.clicks,
            createdAt: shortUrl.createdAt
          }
        });
      }

      // Crear nuevo short URL
      const shortCode = await generateUniqueCode();
      
      shortUrl = await models.ShortUrl.create({
        shortCode,
        originalUrl,
        resourceType: resourceType || 'other',
        resourceId: resourceId || null,
        createdBy: req.user?._id || null,
        isActive: true
      });

      console.log('✅ [ShortUrl] Short URL creado:', shortCode);

      res.status(201).json({
        shortUrl: {
          shortCode: shortUrl.shortCode,
          originalUrl: shortUrl.originalUrl,
          fullShortUrl: `${req.protocol}://${req.get('host')}/s/${shortUrl.shortCode}`,
          clicks: shortUrl.clicks,
          createdAt: shortUrl.createdAt
        }
      });

    } catch (error) {
      console.error('❌ [ShortUrl] Error creando short URL:', error);
      res.status(500).json({
        message: 500,
        message_text: "Error al crear short URL"
      });
    }
  },

  // Redirigir desde short URL
  redirect: async (req, res) => {
    try {
      const { shortCode } = req.params;

      console.log('🔍 [ShortUrl] Buscando código:', shortCode);

      const shortUrl = await models.ShortUrl.findOne({
        shortCode,
        isActive: true
      });

      if (!shortUrl) {
        console.log('❌ [ShortUrl] Código no encontrado:', shortCode);
        // Redirigir al home
        return res.redirect('/');
      }

      // Verificar si expiró
      if (shortUrl.expiresAt && new Date() > shortUrl.expiresAt) {
        console.log('⏰ [ShortUrl] Código expirado:', shortCode);
        return res.redirect('/');
      }

      // Incrementar contador de clicks
      shortUrl.clicks += 1;
      shortUrl.lastAccessedAt = new Date();
      await shortUrl.save();

      console.log('✅ [ShortUrl] Redirigiendo a:', shortUrl.originalUrl);
      console.log('📊 [ShortUrl] Clicks totales:', shortUrl.clicks);

      // Redirigir a la URL original
      res.redirect(shortUrl.originalUrl);

    } catch (error) {
      console.error('❌ [ShortUrl] Error en redirección:', error);
      res.redirect('/');
    }
  },

  // Obtener estadísticas de un short URL
  stats: async (req, res) => {
    try {
      const { shortCode } = req.params;

      const shortUrl = await models.ShortUrl.findOne({ shortCode });

      if (!shortUrl) {
        return res.status(404).json({
          message: 404,
          message_text: "Short URL no encontrado"
        });
      }

      res.status(200).json({
        shortUrl: {
          shortCode: shortUrl.shortCode,
          originalUrl: shortUrl.originalUrl,
          resourceType: shortUrl.resourceType,
          clicks: shortUrl.clicks,
          lastAccessedAt: shortUrl.lastAccessedAt,
          createdAt: shortUrl.createdAt,
          isActive: shortUrl.isActive
        }
      });

    } catch (error) {
      console.error('❌ [ShortUrl] Error obteniendo stats:', error);
      res.status(500).json({
        message: 500,
        message_text: "Error al obtener estadísticas"
      });
    }
  },

  // Listar short URLs del usuario
  list: async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: 401,
          message_text: "No autenticado"
        });
      }

      const shortUrls = await models.ShortUrl.find({
        createdBy: req.user._id,
        isActive: true
      })
      .sort({ createdAt: -1 })
      .limit(50);

      res.status(200).json({
        shortUrls: shortUrls.map(su => ({
          shortCode: su.shortCode,
          originalUrl: su.originalUrl,
          resourceType: su.resourceType,
          clicks: su.clicks,
          createdAt: su.createdAt
        }))
      });

    } catch (error) {
      console.error('❌ [ShortUrl] Error listando short URLs:', error);
      res.status(500).json({
        message: 500,
        message_text: "Error al listar short URLs"
      });
    }
  }
};
