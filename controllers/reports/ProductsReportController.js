import models from "../../models/index.js";

export default {
  /**
   * REPORTE: Análisis completo de productos (cursos y proyectos)
   * Admin: Todos los productos
   * Instructor: Solo sus productos
   */
  productsAnalysis: async (req, res) => {
    try {
      const user = req.user;
      const { product_type } = req.query; // 'course', 'project', o undefined para ambos

      if (user.rol === 'admin') {
        // Obtener todos los productos según el filtro
        let courses = [];
        let projects = [];

        if (!product_type || product_type === 'course') {
          courses = await models.Course.find({ state: 2 }).populate('categorie').populate('user', 'name surname');
        }
        if (!product_type || product_type === 'project') {
          projects = await models.Project.find({ state: 2 }).populate('categorie').populate('user', 'name surname');
        }

        // Obtener estadísticas de ventas
        const sales = await models.Sale.find({ status: 'Pagado' });

        // Obtener reviews
        const reviews = await models.Review.find();

        // Crear mapa de estadísticas
        const productStats = {};

        // Procesar ventas
        sales.forEach(sale => {
          sale.detail.forEach(item => {
            const productId = item.product.toString();
            if (!productStats[productId]) {
              productStats[productId] = {
                total_sales: 0,
                total_revenue: 0,
                ratings: []
              };
            }
            productStats[productId].total_sales += 1;
            productStats[productId].total_revenue += item.price_unit;
          });
        });

        // Procesar reviews
        reviews.forEach(review => {
          const productId = review.product.toString();
          if (productStats[productId]) {
            productStats[productId].ratings.push(review.rating);
          }
        });

        // Construir respuesta para cursos
        const coursesAnalysis = courses.map(course => {
          const stats = productStats[course._id.toString()] || { total_sales: 0, total_revenue: 0, ratings: [] };
          const avgRating = stats.ratings.length > 0 
            ? (stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length).toFixed(2)
            : 0;

          return {
            product_id: course._id,
            product_type: 'course',
            title: course.title,
            slug: course.slug,
            category: course.categorie ? course.categorie.title : 'Sin categoría',
            instructor: `${course.user.name} ${course.user.surname}`,
            price_usd: course.price_usd,
            price_mxn: course.price_mxn,
            total_sales: stats.total_sales,
            total_revenue: stats.total_revenue,
            avg_rating: parseFloat(avgRating),
            total_reviews: stats.ratings.length,
            created_at: course.createdAt
          };
        });

        // Construir respuesta para proyectos
        const projectsAnalysis = projects.map(project => {
          const stats = productStats[project._id.toString()] || { total_sales: 0, total_revenue: 0, ratings: [] };
          const avgRating = stats.ratings.length > 0 
            ? (stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length).toFixed(2)
            : 0;

          return {
            product_id: project._id,
            product_type: 'project',
            title: project.title,
            slug: project.slug,
            category: project.categorie ? project.categorie.title : 'Sin categoría',
            instructor: `${project.user.name} ${project.user.surname}`,
            price_usd: project.price_usd,
            price_mxn: project.price_mxn,
            total_sales: stats.total_sales,
            total_revenue: stats.total_revenue,
            avg_rating: parseFloat(avgRating),
            total_reviews: stats.ratings.length,
            created_at: project.createdAt
          };
        });

        const allProducts = [...coursesAnalysis, ...projectsAnalysis]
          .sort((a, b) => b.total_revenue - a.total_revenue);

        return res.status(200).json({ products: allProducts });

      } else if (user.rol === 'instructor') {
        // Obtener solo productos del instructor
        let courses = [];
        let projects = [];

        if (!product_type || product_type === 'course') {
          courses = await models.Course.find({ user: user._id, state: 2 }).populate('categorie');
        }
        if (!product_type || product_type === 'project') {
          projects = await models.Project.find({ user: user._id, state: 2 }).populate('categorie');
        }

        const productIds = [
          ...courses.map(c => c._id.toString()),
          ...projects.map(p => p._id.toString())
        ];

        // Obtener estadísticas de ventas
        const sales = await models.Sale.find({ status: 'Pagado' });

        // Obtener reviews
        const reviews = await models.Review.find({ product: { $in: productIds } });

        // Crear mapa de estadísticas
        const productStats = {};

        // Procesar ventas
        sales.forEach(sale => {
          sale.detail.forEach(item => {
            const productId = item.product.toString();
            if (productIds.includes(productId)) {
              if (!productStats[productId]) {
                productStats[productId] = {
                  total_sales: 0,
                  total_revenue: 0,
                  ratings: []
                };
              }
              productStats[productId].total_sales += 1;
              productStats[productId].total_revenue += item.price_unit;
            }
          });
        });

        // Procesar reviews
        reviews.forEach(review => {
          const productId = review.product.toString();
          if (productStats[productId]) {
            productStats[productId].ratings.push(review.rating);
          }
        });

        // Construir respuesta para cursos
        const coursesAnalysis = courses.map(course => {
          const stats = productStats[course._id.toString()] || { total_sales: 0, total_revenue: 0, ratings: [] };
          const avgRating = stats.ratings.length > 0 
            ? (stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length).toFixed(2)
            : 0;

          return {
            product_id: course._id,
            product_type: 'course',
            title: course.title,
            slug: course.slug,
            category: course.categorie ? course.categorie.title : 'Sin categoría',
            price_usd: course.price_usd,
            price_mxn: course.price_mxn,
            total_sales: stats.total_sales,
            total_revenue: stats.total_revenue,
            avg_rating: parseFloat(avgRating),
            total_reviews: stats.ratings.length,
            created_at: course.createdAt
          };
        });

        // Construir respuesta para proyectos
        const projectsAnalysis = projects.map(project => {
          const stats = productStats[project._id.toString()] || { total_sales: 0, total_revenue: 0, ratings: [] };
          const avgRating = stats.ratings.length > 0 
            ? (stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length).toFixed(2)
            : 0;

          return {
            product_id: project._id,
            product_type: 'project',
            title: project.title,
            slug: project.slug,
            category: project.categorie ? project.categorie.title : 'Sin categoría',
            price_usd: project.price_usd,
            price_mxn: project.price_mxn,
            total_sales: stats.total_sales,
            total_revenue: stats.total_revenue,
            avg_rating: parseFloat(avgRating),
            total_reviews: stats.ratings.length,
            created_at: project.createdAt
          };
        });

        const allProducts = [...coursesAnalysis, ...projectsAnalysis]
          .sort((a, b) => b.total_revenue - a.total_revenue);

        return res.status(200).json({ products: allProducts });
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en productsAnalysis:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Productos con bajo rendimiento
   * Productos con pocas ventas o ratings bajos
   */
  lowPerformingProducts: async (req, res) => {
    try {
      const user = req.user;
      const { min_sales = 5, min_rating = 3 } = req.query;

      let courses = [];
      let projects = [];

      if (user.rol === 'admin') {
        courses = await models.Course.find({ state: 2 }).populate('categorie').populate('user', 'name surname');
        projects = await models.Project.find({ state: 2 }).populate('categorie').populate('user', 'name surname');
      } else if (user.rol === 'instructor') {
        courses = await models.Course.find({ user: user._id, state: 2 }).populate('categorie');
        projects = await models.Project.find({ user: user._id, state: 2 }).populate('categorie');
      } else {
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      const allProductIds = [
        ...courses.map(c => c._id.toString()),
        ...projects.map(p => p._id.toString())
      ];

      // Obtener estadísticas
      const sales = await models.Sale.find({ status: 'Pagado' });
      const reviews = await models.Review.find({ product: { $in: allProductIds } });

      const productStats = {};

      // Inicializar stats
      [...courses, ...projects].forEach(product => {
        productStats[product._id.toString()] = {
          product,
          total_sales: 0,
          ratings: []
        };
      });

      // Procesar ventas
      sales.forEach(sale => {
        sale.detail.forEach(item => {
          const productId = item.product.toString();
          if (productStats[productId]) {
            productStats[productId].total_sales += 1;
          }
        });
      });

      // Procesar reviews
      reviews.forEach(review => {
        const productId = review.product.toString();
        if (productStats[productId]) {
          productStats[productId].ratings.push(review.rating);
        }
      });

      // Filtrar productos de bajo rendimiento
      const lowPerforming = Object.values(productStats)
        .filter(stat => {
          const avgRating = stat.ratings.length > 0 
            ? stat.ratings.reduce((a, b) => a + b, 0) / stat.ratings.length
            : 5; // Si no hay ratings, asumimos que está bien
          
          return stat.total_sales < parseInt(min_sales) || avgRating < parseFloat(min_rating);
        })
        .map(stat => {
          const product = stat.product;
          const avgRating = stat.ratings.length > 0 
            ? (stat.ratings.reduce((a, b) => a + b, 0) / stat.ratings.length).toFixed(2)
            : 0;

          return {
            product_id: product._id,
            product_type: product.constructor.modelName, // 'course' o 'project'
            title: product.title,
            category: product.categorie ? product.categorie.title : 'Sin categoría',
            instructor: user.rol === 'admin' ? `${product.user.name} ${product.user.surname}` : null,
            total_sales: stat.total_sales,
            avg_rating: parseFloat(avgRating),
            total_reviews: stat.ratings.length,
            reason: stat.total_sales < parseInt(min_sales) ? 'Pocas ventas' : 'Rating bajo'
          };
        });

      return res.status(200).json({ lowPerformingProducts: lowPerforming });

    } catch (error) {
      console.error("Error en lowPerformingProducts:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Análisis de reviews por producto
   */
  reviewsAnalysis: async (req, res) => {
    try {
      const user = req.user;
      const { product_id } = req.query;

      let query = {};
      
      if (product_id) {
        query.product = product_id;
      }

      // Si es instructor, verificar que el producto sea suyo
      if (user.rol === 'instructor' && product_id) {
        const course = await models.Course.findOne({ _id: product_id, user: user._id });
        const project = await models.Project.findOne({ _id: product_id, user: user._id });
        
        if (!course && !project) {
          return res.status(403).json({ message: 'No tienes acceso a este producto' });
        }
      }

      const reviews = await models.Review.find(query)
        .populate('user', 'name surname email')
        .populate('product', 'title')
        .sort({ createdAt: -1 });

      // Calcular estadísticas
      const ratingDistribution = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0
      };

      reviews.forEach(review => {
        ratingDistribution[review.rating] += 1;
      });

      const avgRating = reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(2)
        : 0;

      return res.status(200).json({
        reviews: reviews.map(r => ({
          review_id: r._id,
          product_title: r.product.title,
          product_type: r.product_type,
          user_name: `${r.user.name} ${r.user.surname}`,
          rating: r.rating,
          description: r.description,
          created_at: r.createdAt
        })),
        statistics: {
          total_reviews: reviews.length,
          avg_rating: parseFloat(avgRating),
          rating_distribution: ratingDistribution
        }
      });

    } catch (error) {
      console.error("Error en reviewsAnalysis:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * 📊 REPORTE COMPLETO DE PRODUCTOS (Para el tab de productos)
   * Admin: Todos los productos
   * Instructor: Solo sus productos
   * ✅ Incluye estadísticas completas de ventas y reviews
   * ✅ Excluye ventas reembolsadas
   * ✅ Devuelve datos formateados para el frontend
   */
  productsReport: async (req, res) => {
    try {
      console.log('📊 [productsReport] Generando reporte completo de productos...');
      
      const user = req.user;
      const { product_type, sort_by = 'revenue' } = req.query; // 'course', 'project', o undefined para ambos

      console.log(`   • Usuario: ${user.name} (${user.rol})`);
      console.log(`   • Tipo producto: ${product_type || 'todos'}`);
      console.log(`   • Ordenar por: ${sort_by}`);

      // ✅ Obtener ventas reembolsadas para excluirlas
      const refundedSales = await models.Refund.find({
        status: 'completed',
        state: 1
      }).distinct('sale');

      console.log(`   🚫 Excluyendo ${refundedSales.length} ventas reembolsadas`);

      let courses = [];
      let projects = [];

      if (user.rol === 'admin') {
        // Admin ve todos los productos
        console.log('   👑 Modo Admin: Obteniendo todos los productos');
        
        if (!product_type || product_type === 'course') {
          courses = await models.Course.find()
            .populate('categorie', 'title')
            .populate('user', 'name surname')
            .lean();
        }
        if (!product_type || product_type === 'project') {
          projects = await models.Project.find()
            .populate('categorie', 'title')
            .populate('user', 'name surname')
            .lean();
        }

        console.log(`   • Cursos encontrados: ${courses.length}`);
        console.log(`   • Proyectos encontrados: ${projects.length}`);

      } else if (user.rol === 'instructor') {
        // Instructor ve solo sus productos
        console.log('   👨‍🏫 Modo Instructor: Filtrando por productos propios');
        
        if (!product_type || product_type === 'course') {
          courses = await models.Course.find({ user: user._id })
            .populate('categorie', 'title')
            .lean();
        }
        if (!product_type || product_type === 'project') {
          projects = await models.Project.find({ user: user._id })
            .populate('categorie', 'title')
            .lean();
        }

        console.log(`   • Cursos del instructor: ${courses.length}`);
        console.log(`   • Proyectos del instructor: ${projects.length}`);
      }

      // Obtener todas las ventas (excluyendo reembolsadas)
      const sales = await models.Sale.find({ 
        status: 'Pagado',
        _id: { $nin: refundedSales }
      }).lean();

      console.log(`   📊 Procesando ${sales.length} ventas...`);

      // Crear mapa de estadísticas por producto
      const productStatsMap = new Map();

      // Inicializar stats para todos los productos
      [...courses, ...projects].forEach(product => {
        productStatsMap.set(product._id.toString(), {
          product,
          type: product.hasOwnProperty('sections') ? 'course' : 'project',
          totalSales: 0,
          totalRevenue: 0,
          ratings: []
        });
      });

      // Procesar ventas
      sales.forEach(sale => {
        sale.detail.forEach(item => {
          const productId = item.product.toString();
          const stats = productStatsMap.get(productId);
          
          if (stats) {
            stats.totalSales += 1;
            stats.totalRevenue += item.price_unit || 0;
          }
        });
      });

      // Obtener reviews
      const allProductIds = Array.from(productStatsMap.keys());
      const reviews = await models.Review.find({ 
        course: { $in: allProductIds }
      }).lean();

      console.log(`   ⭐ Procesando ${reviews.length} reviews...`);

      // Procesar reviews
      reviews.forEach(review => {
        const productId = review.course.toString();
        const stats = productStatsMap.get(productId);
        
        if (stats && review.rating) {
          stats.ratings.push(review.rating);
        }
      });

      // Formatear datos para el frontend
      const formattedProducts = [];

      productStatsMap.forEach((stats, productId) => {
        const product = stats.product;
        const avgRating = stats.ratings.length > 0
          ? stats.ratings.reduce((sum, r) => sum + r, 0) / stats.ratings.length
          : 0;

        formattedProducts.push({
          _id: product._id,
          title: product.title,
          slug: product.slug,
          type: stats.type,
          category: product.categorie?.title || 'Sin categoría',
          instructor: user.rol === 'admin' && product.user 
            ? `${product.user.name} ${product.user.surname}`
            : null,
          price: product.price_usd || 0,
          status: product.state === 1 ? 'Borrador' : product.state === 2 ? 'Público' : 'Anulado',
          totalSales: stats.totalSales,
          totalRevenue: stats.totalRevenue,
          avgRating: parseFloat(avgRating.toFixed(2)),
          totalReviews: stats.ratings.length,
          createdAt: product.createdAt
        });
      });

      // Ordenar según criterio
      formattedProducts.sort((a, b) => {
        switch (sort_by) {
          case 'sales':
            return b.totalSales - a.totalSales;
          case 'rating':
            return b.avgRating - a.avgRating;
          case 'revenue':
          default:
            return b.totalRevenue - a.totalRevenue;
        }
      });

      console.log(`   ✅ Formateados ${formattedProducts.length} productos`);

      // Calcular estadísticas globales
      const stats = {
        totalProducts: formattedProducts.length,
        totalCourses: formattedProducts.filter(p => p.type === 'course').length,
        totalProjects: formattedProducts.filter(p => p.type === 'project').length,
        totalSales: formattedProducts.reduce((sum, p) => sum + p.totalSales, 0),
        totalRevenue: formattedProducts.reduce((sum, p) => sum + p.totalRevenue, 0),
        avgRating: formattedProducts.length > 0
          ? formattedProducts.reduce((sum, p) => sum + p.avgRating, 0) / formattedProducts.length
          : 0
      };

      console.log('   📊 Estadísticas:');
      console.log(`      • Total productos: ${stats.totalProducts}`);
      console.log(`      • Cursos: ${stats.totalCourses}`);
      console.log(`      • Proyectos: ${stats.totalProjects}`);
      console.log(`      • Ventas totales: ${stats.totalSales}`);
      console.log(`      • Ingresos totales: ${stats.totalRevenue.toFixed(2)}`);
      console.log(`      • Rating promedio: ${stats.avgRating.toFixed(2)}`);

      console.log('✅ [productsReport] Reporte generado exitosamente');

      res.status(200).json({
        success: true,
        products: formattedProducts,
        stats: stats
      });

    } catch (error) {
      console.error('❌ [productsReport] Error:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Error al generar el reporte de productos',
        error: error.message
      });
    }
  }
};
