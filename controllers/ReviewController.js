import models from "../models/index.js";
import token from "../service/token.js";
import NotificationController from "./NotificationController.js";

export default {
  // Crear una nueva calificación/review
  create: async (req, res) => {
    try {
      // El middleware 'auth.verifyTienda' ya validó el token y adjuntó el usuario a 'req.user'
      const user_id = req.user._id;

      const { product_id, product_type, rating, description } = req.body;

      // Validaciones
      if (!product_id || !product_type || !rating || !description) {
        return res.status(400).json({
          message: "Datos incompletos",
          message_text: "Todos los campos son requeridos"
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          message: "Calificación inválida",
          message_text: "La calificación debe estar entre 1 y 5 estrellas"
        });
      }

      if (!['course', 'project'].includes(product_type)) {
        return res.status(400).json({
          message: "Tipo de producto inválido",
          message_text: "El tipo de producto debe ser 'course' o 'project'"
        });
      }

      // Verificar que el producto existe
      const ProductModel = product_type === 'course' ? models.Course : models.Project;
      const product = await ProductModel.findById(product_id);
      
      if (!product) {
        return res.status(404).json({
          message: "Producto no encontrado",
          message_text: "El curso o proyecto no existe"
        });
      }

      // Verificar que el usuario haya comprado el producto
      const sale = await models.Sale.findOne({
        user: user_id,
        status: 'Pagado',
        'detail.product': product_id
      });

      if (!sale) {
        return res.status(403).json({
          message: "Acceso denegado",
          message_text: "Debes haber comprado este curso para poder calificarlo"
        });
      }

      // Verificar si el usuario ya calificó este producto
      const existingReview = await models.Review.findOne({
        user: user_id,
        product: product_id,
        product_type: product_type
      });

      if (existingReview) {
        return res.status(400).json({
          message: "Ya calificado",
          message_text: "Ya has calificado este curso anteriormente"
        });
      }

      // Obtener el sale_detail correspondiente
      const saleDetail = sale.detail.find(detail => 
        detail.product.toString() === product_id
      );

      if (!saleDetail) {
        return res.status(400).json({
          message: "Error en la compra",
          message_text: "No se encontró el detalle de la compra"
        });
      }

      // Crear la nueva review
      const newReview = new models.Review({
        product_type: product_type,
        product: product_id,
        user: user_id,
        sale_detail: saleDetail._id,
        rating: rating,
        description: description.trim()
      });

      await newReview.save();

      // Poblar la review con información del usuario
      await newReview.populate('user', 'name surname avatar');

      // Formatear la respuesta
      const reviewResponse = {
        _id: newReview._id,
        rating: newReview.rating,
        description: newReview.description,
        createdAt: newReview.createdAt,
        user_info: {
          _id: newReview.user._id,
          full_name: `${newReview.user.name} ${newReview.user.surname}`.trim(),
          avatar: newReview.user.avatar 
            ? `${process.env.URL_BACKEND || ""}/api/users/imagen-usuario/${newReview.user.avatar}`
            : null
        }
      };

      res.status(201).json({
        message: "Calificación creada exitosamente",
        review: reviewResponse
      });

    } catch (error) {
      console.error("Error en ReviewController.create:", error);
      res.status(500).json({
        message: "Error interno del servidor",
        message_text: "Ocurrió un error al crear la calificación"
      });
    }
  },

  // Obtener todas las calificaciones de un producto
  getByProduct: async (req, res) => {
    try {
      const { product_id, product_type } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const skip = (page - 1) * limit;

      if (!product_id || !product_type) {
        return res.status(400).json({
          message: "Parámetros requeridos",
          message_text: "Se requiere el ID del producto y el tipo"
        });
      }

      if (!['course', 'project'].includes(product_type)) {
        return res.status(400).json({
          message: "Tipo de producto inválido",
          message_text: "El tipo de producto debe ser 'course' o 'project'"
        });
      }

      // Obtener todas las reviews para estadísticas (sin paginación)
      const allReviews = await models.Review.find({
        product: product_id,
        product_type: product_type
      });

      // Obtener reviews paginadas (✅ INCLUYENDO RESPUESTAS)
      const reviews = await models.Review.find({
        product: product_id,
        product_type: product_type
      })
      .populate('user', 'name surname avatar')
      .populate('reply.user', 'name surname avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

      const reviewsFormatted = reviews.map(review => {
        const reviewObj = review.toObject();
        return {
          _id: reviewObj._id,
          rating: reviewObj.rating,
          description: reviewObj.description,
          createdAt: reviewObj.createdAt,
          user_info: {
            _id: reviewObj.user._id,
            full_name: `${reviewObj.user.name} ${reviewObj.user.surname}`.trim(),
            avatar: reviewObj.user.avatar 
              ? `${process.env.URL_BACKEND || ""}/api/users/imagen-usuario/${reviewObj.user.avatar}`
              : null
          },
          // ✅ AGREGAR RESPUESTA DEL INSTRUCTOR SI EXISTE
          // 🔥 FILTRAR respuestas marcadas como [MARKED_AS_READ] (no mostrarlas al público)
          reply: reviewObj.reply && reviewObj.reply.description && reviewObj.reply.description !== '[MARKED_AS_READ]' ? {
            description: reviewObj.reply.description,
            createdAt: reviewObj.reply.createdAt,
            instructor_info: reviewObj.reply.user ? {
              _id: reviewObj.reply.user._id,
              full_name: `${reviewObj.reply.user.name} ${reviewObj.reply.user.surname}`.trim(),
              avatar: reviewObj.reply.user.avatar 
                ? `${process.env.URL_BACKEND || ""}/api/users/imagen-usuario/${reviewObj.reply.user.avatar}`
                : null
            } : null
          } : null
        };
      });

      // Calcular estadísticas usando todas las reviews
      const totalReviews = allReviews.length;
      const averageRating = totalReviews > 0 
        ? (allReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews).toFixed(2)
        : 0;

      // Distribución de calificaciones usando todas las reviews
      const ratingDistribution = {
        5: allReviews.filter(r => r.rating === 5).length,
        4: allReviews.filter(r => r.rating === 4).length,
        3: allReviews.filter(r => r.rating === 3).length,
        2: allReviews.filter(r => r.rating === 2).length,
        1: allReviews.filter(r => r.rating === 1).length
      };

      // Calcular paginación
      const totalPages = Math.ceil(totalReviews / limit);

      res.status(200).json({
        reviews: reviewsFormatted,
        statistics: {
          total_reviews: totalReviews,
          average_rating: parseFloat(averageRating),
          rating_distribution: ratingDistribution
        },
        pagination: {
          page: page,
          limit: limit,
          total: totalReviews,
          pages: totalPages
        }
      });

    } catch (error) {
      console.error("Error en ReviewController.getByProduct:", error);
      res.status(500).json({
        message: "Error interno del servidor",
        message_text: "Ocurrió un error al obtener las calificaciones"
      });
    }
  },

  // Actualizar una calificación existente
  update: async (req, res) => {
    try {
      // El middleware 'auth.verifyTienda' ya validó el token y adjuntó el usuario a 'req.user'
      const user_id = req.user._id;

      const { review_id } = req.params;
      const { rating, description } = req.body;

      console.log('🔍 [UPDATE] Intentando actualizar review:', {
        review_id,
        user_id: user_id.toString(),
        rating,
        description_length: description?.length
      });

      // Validaciones
      if (!rating || !description) {
        return res.status(400).json({
          message: "Datos incompletos",
          message_text: "La calificación y descripción son requeridas"
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          message: "Calificación inválida",
          message_text: "La calificación debe estar entre 1 y 5 estrellas"
        });
      }

      // Buscar la review
      const review = await models.Review.findById(review_id);

      if (!review) {
        console.log('❌ [UPDATE] Review no encontrada:', review_id);
        return res.status(404).json({
          message: "Calificación no encontrada",
          message_text: "La calificación no existe"
        });
      }

      // ✅ CORRECCIÓN: Convertir ambos IDs a string para comparación
      const reviewUserId = review.user.toString();
      const requestUserId = user_id.toString();

      console.log('🔍 [UPDATE] Comparando IDs:', {
        review_user_id: reviewUserId,
        request_user_id: requestUserId,
        match: reviewUserId === requestUserId
      });

      // Verificar que el usuario sea el propietario de la review
      if (reviewUserId !== requestUserId) {
        console.log('❌ [UPDATE] Usuario no autorizado');
        return res.status(403).json({
          message: "Acceso denegado",
          message_text: "Solo puedes actualizar tus propias calificaciones"
        });
      }

      console.log('✅ [UPDATE] Usuario autorizado, actualizando review...');

      // Actualizar la review
      review.rating = rating;
      review.description = description.trim();
      review.updatedAt = new Date();

      await review.save();

      // Poblar la review con información del usuario
      await review.populate('user', 'name surname avatar');

      // Formatear la respuesta
      const reviewResponse = {
        _id: review._id,
        rating: review.rating,
        description: review.description,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        user_info: {
          _id: review.user._id,
          full_name: `${review.user.name} ${review.user.surname}`.trim(),
          avatar: review.user.avatar 
            ? `${process.env.URL_BACKEND || ""}/api/users/imagen-usuario/${review.user.avatar}`
            : null
        }
      };

      console.log('✅ [UPDATE] Review actualizada exitosamente:', review._id);

      res.status(200).json({
        message: "Calificación actualizada exitosamente",
        review: reviewResponse
      });

    } catch (error) {
      console.error("❌ [UPDATE] Error en ReviewController.update:", error);
      res.status(500).json({
        message: "Error interno del servidor",
        message_text: "Ocurrió un error al actualizar la calificación"
      });
    }
  },

  // Eliminar una calificación
  delete: async (req, res) => {
    try {
      // El middleware 'auth.verifyTienda' ya validó el token y adjuntó el usuario a 'req.user'
      const user_id = req.user._id;

      const { review_id } = req.params;

      // Buscar la review
      const review = await models.Review.findById(review_id);

      if (!review) {
        return res.status(404).json({
          message: "Calificación no encontrada",
          message_text: "La calificación no existe"
        });
      }

      // ✅ CORRECCIÓN: Convertir ambos IDs a string para comparación
      const reviewUserId = review.user.toString();
      const requestUserId = user_id.toString();

      // Verificar que el usuario sea el propietario de la review
      if (reviewUserId !== requestUserId) {
        return res.status(403).json({
          message: "Acceso denegado",
          message_text: "Solo puedes eliminar tus propias calificaciones"
        });
      }

      // Eliminar la review
      await models.Review.findByIdAndDelete(review_id);

      res.status(200).json({
        message: "Calificación eliminada exitosamente"
      });

    } catch (error) {
      console.error("Error en ReviewController.delete:", error);
      res.status(500).json({
        message: "Error interno del servidor",
        message_text: "Ocurrió un error al eliminar la calificación"
      });
    }
  },

  // Verificar si el usuario puede calificar un producto
  canRate: async (req, res) => {
    try {
      const { product_id, product_type } = req.params;

      if (!product_id || !product_type) {
        return res.status(400).json({
          message: "Parámetros requeridos",
          message_text: "Se requiere el ID del producto y el tipo"
        });
      }

      if (!['course', 'project'].includes(product_type)) {
        return res.status(400).json({
          message: "Tipo de producto inválido",
          message_text: "El tipo de producto debe ser 'course' o 'project'"
        });
      }

      // Verificar si hay token de autenticación
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        return res.status(200).json({
          can_rate: false,
          reason: "Debes iniciar sesión para calificar este producto"
        });
      }

      // Decodificar el token para obtener el usuario
      const tokenValue = authHeader.split(' ')[1];
      if (!tokenValue) {
        return res.status(200).json({
          can_rate: false,
          reason: "Token de autenticación inválido"
        });
      }

      const decoded_token = await token.decode(tokenValue);
      if (!decoded_token) {
        return res.status(200).json({
          can_rate: false,
          reason: "Token de autenticación inválido"
        });
      }

      const user_id = decoded_token._id;

      // Verificar que el usuario haya comprado el producto
      const sale = await models.Sale.findOne({
        user: user_id,
        status: 'Pagado',
        'detail.product': product_id
      });

      if (!sale) {
        return res.status(200).json({
          can_rate: false,
          reason: "No has comprado este producto"
        });
      }

      // Verificar si ya calificó
      const existingReview = await models.Review.findOne({
        user: user_id,
        product: product_id,
        product_type: product_type
      });

      if (existingReview) {
        return res.status(200).json({
          can_rate: true, // Permitir edición de calificación existente
          reason: "Puedes editar tu calificación",
          existing_review: {
            _id: existingReview._id,
            rating: existingReview.rating,
            description: existingReview.description,
            createdAt: existingReview.createdAt
          }
        });
      }

      res.status(200).json({
        can_rate: true,
        reason: "Puedes calificar este producto"
      });

    } catch (error) {
      console.error("Error en ReviewController.canRate:", error);
      res.status(500).json({
        message: "Error interno del servidor",
        message_text: "Ocurrió un error al verificar los permisos"
      });
    }
  },

  // ✅ NUEVO: Agregar respuesta del instructor a una review
  addReply: async (req, res) => {
    try {
      const user_id = req.user._id;
      const { review_id } = req.params;
      const { description } = req.body;

      console.log('🔍 [ADD REPLY] Intentando agregar respuesta:', {
        review_id,
        instructor_id: user_id.toString(),
        description_length: description?.length
      });

      if (!description || !description.trim()) {
        return res.status(400).json({
          message: "Respuesta requerida",
          message_text: "Debes escribir una respuesta"
        });
      }

      const review = await models.Review.findById(review_id).populate('product');
      
      if (!review) {
        console.log('❌ [ADD REPLY] Review no encontrada:', review_id);
        return res.status(404).json({
          message: "Calificación no encontrada",
          message_text: "La calificación no existe"
        });
      }

      if (review.reply && review.reply.description) {
        console.log('❌ [ADD REPLY] La review ya tiene respuesta');
        return res.status(400).json({
          message: "Ya tiene respuesta",
          message_text: "Esta calificación ya tiene una respuesta"
        });
      }

      const ProductModel = review.product_type === 'course' ? models.Course : models.Project;
      const product = await ProductModel.findById(review.product);
      
      if (!product) {
        console.log('❌ [ADD REPLY] Producto no encontrado');
        return res.status(404).json({
          message: "Producto no encontrado",
          message_text: "El curso o proyecto no existe"
        });
      }

      const currentUser = await models.User.findById(user_id);
      
      if (!currentUser) {
        console.log('❌ [ADD REPLY] Usuario no encontrado');
        return res.status(404).json({
          message: "Usuario no encontrado",
          message_text: "Usuario no válido"
        });
      }

      const productUserId = product.user.toString();
      const currentUserId = currentUser._id.toString();
      
      console.log('🔍 [ADD REPLY] Verificando permisos:', {
        product_instructor: productUserId,
        current_user: currentUserId,
        user_role: currentUser.rol,
        match: productUserId === currentUserId
      });

      const isInstructor = productUserId === currentUserId;
      const isAdmin = currentUser.rol === 'admin';
      
      if (!isInstructor && !isAdmin) {
        console.log('❌ [ADD REPLY] Usuario no autorizado');
        return res.status(403).json({
          message: "Acceso denegado",
          message_text: "Solo el instructor de este curso puede responder a las calificaciones"
        });
      }

      review.reply = {
        user: user_id,
        description: description.trim(),
        createdAt: new Date()
      };

      await review.save();
      await review.populate('reply.user', 'name surname avatar');

      // 🔥 AUTO-MARCAR NOTIFICACIÓN COMO LEÍDA
      await NotificationController.markReviewNotificationAsRead(review_id, user_id);
      console.log('✅ [ADD REPLY] Notificación auto-marcada como leída');

      const replyResponse = {
        _id: review._id,
        reply: {
          description: review.reply.description,
          createdAt: review.reply.createdAt,
          instructor_info: {
            _id: review.reply.user._id,
            full_name: `${review.reply.user.name} ${review.reply.user.surname}`.trim(),
            avatar: review.reply.user.avatar 
              ? `${process.env.URL_BACKEND || ""}/api/users/imagen-usuario/${review.reply.user.avatar}`
              : null
          }
        }
      };

      console.log('✅ [ADD REPLY] Respuesta agregada exitosamente');

      res.status(200).json({
        message: "Respuesta agregada exitosamente",
        review: replyResponse
      });

    } catch (error) {
      console.error("❌ [ADD REPLY] Error en ReviewController.addReply:", error);
      res.status(500).json({
        message: "Error interno del servidor",
        message_text: "Ocurrió un error al agregar la respuesta"
      });
    }
  },

  // ✅ NUEVO: Actualizar respuesta del instructor
  updateReply: async (req, res) => {
    try {
      const user_id = req.user._id;
      const { review_id } = req.params;
      const { description } = req.body;

      console.log('🔍 [UPDATE REPLY] Intentando actualizar respuesta:', {
        review_id,
        instructor_id: user_id.toString()
      });

      if (!description || !description.trim()) {
        return res.status(400).json({
          message: "Respuesta requerida",
          message_text: "Debes escribir una respuesta"
        });
      }

      const review = await models.Review.findById(review_id);
      
      if (!review) {
        return res.status(404).json({
          message: "Calificación no encontrada",
          message_text: "La calificación no existe"
        });
      }

      if (!review.reply || !review.reply.description) {
        return res.status(400).json({
          message: "Sin respuesta",
          message_text: "Esta calificación no tiene respuesta aún"
        });
      }

      const replyUserId = review.reply.user.toString();
      const currentUserId = user_id.toString();
      
      if (replyUserId !== currentUserId) {
        return res.status(403).json({
          message: "Acceso denegado",
          message_text: "Solo puedes editar tus propias respuestas"
        });
      }

      review.reply.description = description.trim();
      review.reply.createdAt = new Date();

      await review.save();
      await review.populate('reply.user', 'name surname avatar');

      const replyResponse = {
        _id: review._id,
        reply: {
          description: review.reply.description,
          createdAt: review.reply.createdAt,
          instructor_info: {
            _id: review.reply.user._id,
            full_name: `${review.reply.user.name} ${review.reply.user.surname}`.trim(),
            avatar: review.reply.user.avatar 
              ? `${process.env.URL_BACKEND || ""}/api/users/imagen-usuario/${review.reply.user.avatar}`
              : null
          }
        }
      };

      console.log('✅ [UPDATE REPLY] Respuesta actualizada exitosamente');

      res.status(200).json({
        message: "Respuesta actualizada exitosamente",
        review: replyResponse
      });

    } catch (error) {
      console.error("❌ [UPDATE REPLY] Error:", error);
      res.status(500).json({
        message: "Error interno del servidor",
        message_text: "Ocurrió un error al actualizar la respuesta"
      });
    }
  },

  // ✅ NUEVO: Eliminar respuesta del instructor
  deleteReply: async (req, res) => {
    try {
      const user_id = req.user._id;
      const { review_id } = req.params;

      console.log('🔍 [DELETE REPLY] Intentando eliminar respuesta:', {
        review_id,
        instructor_id: user_id.toString()
      });

      const review = await models.Review.findById(review_id);
      
      if (!review) {
        return res.status(404).json({
          message: "Calificación no encontrada",
          message_text: "La calificación no existe"
        });
      }

      if (!review.reply || !review.reply.description) {
        return res.status(400).json({
          message: "Sin respuesta",
          message_text: "Esta calificación no tiene respuesta"
        });
      }

      const replyUserId = review.reply.user.toString();
      const currentUserId = user_id.toString();
      
      if (replyUserId !== currentUserId) {
        return res.status(403).json({
          message: "Acceso denegado",
          message_text: "Solo puedes eliminar tus propias respuestas"
        });
      }

      review.reply = undefined;
      await review.save();

      console.log('✅ [DELETE REPLY] Respuesta eliminada exitosamente');

      res.status(200).json({
        message: "Respuesta eliminada exitosamente"
      });

    } catch (error) {
      console.error("❌ [DELETE REPLY] Error:", error);
      res.status(500).json({
        message: "Error interno del servidor",
        message_text: "Ocurrió un error al eliminar la respuesta"
      });
    }
  },

  // 🔔 NUEVO: Marcar todas las notificaciones de reviews como respondidas
  markAllRepliesAsRead: async (req, res) => {
    try {
      const instructorId = req.user._id;
      console.log('🧹 [MARK ALL READ] Marcando todas las reviews como respondidas para instructor:', instructorId.toString());

      // Obtener todos los cursos del instructor
      const instructorCourses = await models.Course.find({ 
        user: instructorId,
        state: { $in: [1, 2] }
      }).select('_id');

      const courseIds = instructorCourses.map(course => course._id);

      if (courseIds.length === 0) {
        console.log('ℹ️ [MARK ALL READ] Instructor no tiene cursos');
        return res.status(200).json({
          success: true,
          message: 'No hay cursos para actualizar',
          marked: 0
        });
      }

      console.log(`🔍 [MARK ALL READ] Buscando reviews sin respuesta en ${courseIds.length} cursos`);

      // Buscar reviews sin respuesta en los cursos del instructor
      // 🔥 CORREGIDO: Excluir reviews marcadas como leídas con [MARKED_AS_READ]
      const pendingReviews = await models.Review.find({
        product: { $in: courseIds },
        product_type: 'course',
        $or: [
          { 'reply.description': { $exists: false } },
          { 'reply.description': null },
          { 'reply.description': '' }
        ],
        // 🔥 EXCLUIR reviews marcadas como leídas
        'reply.description': { $ne: '[MARKED_AS_READ]' }
      });

      console.log(`📊 [MARK ALL READ] Encontradas ${pendingReviews.length} reviews sin respuesta`);

      // Marcar como respondidas agregando un reply especial "[MARKED_AS_READ]"
      // Esto hará que no aparezcan en las notificaciones pero no son respuestas reales
      let markedCount = 0;
      for (const review of pendingReviews) {
        review.reply = {
          user: instructorId,
          description: '[MARKED_AS_READ]', // Flag especial
          createdAt: new Date()
        };
        await review.save();
        markedCount++;
      }

      console.log(`✅ [MARK ALL READ] ${markedCount} reviews marcadas como leídas`);

      res.status(200).json({
        success: true,
        message: `${markedCount} notificaciones marcadas como leídas`,
        marked: markedCount
      });

    } catch (error) {
      console.error('❌ [MARK ALL READ] Error completo:', error);
      console.error('❌ [MARK ALL READ] Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: "Error al marcar notificaciones como leídas",
        message_text: "Ocurrió un error al procesar la solicitud",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // 🔔 NUEVO: Obtener reviews sin respuesta de los cursos del instructor (notificaciones)
  getPendingRepliesForInstructor: async (req, res) => {
    try {
      const instructorId = req.user._id;
      console.log('🔔 [PENDING REPLIES] Obteniendo reviews sin respuesta para instructor:', instructorId.toString());

      // Obtener todos los cursos del instructor
      const instructorCourses = await models.Course.find({ 
        user: instructorId,
        state: { $in: [1, 2] } // Solo cursos activos (borrador o público)
      }).select('_id title imagen slug'); // 🔥 Agregar slug al select

      const courseIds = instructorCourses.map(course => course._id);

      if (courseIds.length === 0) {
        console.log('ℹ️ [PENDING REPLIES] Instructor no tiene cursos');
        return res.status(200).json({
          success: true,
          notifications: [],
          count: 0
        });
      }

      console.log(`🔍 [PENDING REPLIES] Buscando reviews en ${courseIds.length} cursos`);

      // Buscar reviews sin respuesta en los cursos del instructor
      const pendingReviews = await models.Review.find({
        product: { $in: courseIds },
        product_type: 'course',
        $or: [
          { 'reply.description': { $exists: false } },
          { 'reply.description': null },
          { 'reply.description': '' }
        ]
      })
      .populate('user', 'name surname avatar')
      .populate('product', 'title imagen slug') // 🔥 Asegurar que slug se incluya
      .sort({ createdAt: -1 })
      .limit(20); // Limitar a las últimas 20 notificaciones

      console.log(`✅ [PENDING REPLIES] Encontradas ${pendingReviews.length} reviews sin respuesta`);

      // Formatear notificaciones con validaciones robustas
      const notifications = pendingReviews
        .filter(review => review.user && review.product) // 🔥 Filtrar reviews con datos válidos
        .map(review => {
          const course = review.product;
          const user = review.user;
          
          console.log(`  - Review ${review._id}: ${user.name} en ${course.title}`);
          
          return {
            _id: review._id,
            rating: review.rating,
            description: review.description,
            createdAt: review.createdAt,
            student: {
              _id: user._id,
              name: user.name,
              surname: user.surname,
              full_name: `${user.name} ${user.surname}`.trim(),
              avatar: user.avatar 
                ? `${process.env.URL_BACKEND || ""}/api/users/imagen-usuario/${user.avatar}` // 🔥 Corregido: user.avatar (no user.user.avatar)
                : null
            },
            course: {
              _id: course._id,
              title: course.title,
              slug: course.slug || 'sin-slug', // 🔥 Fallback para slug
              imagen: course.imagen
            },
            // Detectar si es reciente (menos de 24 horas)
            isRecent: review.createdAt && (Date.now() - new Date(review.createdAt).getTime()) < 86400000
          };
        });

      console.log(`📦 [PENDING REPLIES] Retornando ${notifications.length} notificaciones`);

      res.status(200).json({
        success: true,
        notifications,
        count: notifications.length
      });

    } catch (error) {
      console.error('❌ [PENDING REPLIES] Error completo:', error);
      console.error('❌ [PENDING REPLIES] Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: "Error al obtener notificaciones",
        message_text: "Ocurrió un error al obtener las notificaciones",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};
