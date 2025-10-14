import models from "../../models/index.js";

export default {
  /**
   * REPORTE: Ranking de instructores
   * Solo Admin
   */
  instructorRanking: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      const instructors = await models.User.find({ rol: 'instructor' }).select('_id name surname email');
      
      const instructorStats = {};

      // Inicializar stats
      instructors.forEach(instructor => {
        instructorStats[instructor._id.toString()] = {
          instructor_id: instructor._id,
          name: instructor.name,
          surname: instructor.surname,
          email: instructor.email,
          total_courses: 0,
          total_projects: 0,
          total_students: 0,
          total_revenue: 0,
          total_reviews: 0,
          avg_rating: 0
        };
      });

      // Contar cursos y proyectos
      const courses = await models.Course.find({ state: 2 });
      const projects = await models.Project.find({ state: 2 });

      courses.forEach(course => {
        const instructorId = course.user.toString();
        if (instructorStats[instructorId]) {
          instructorStats[instructorId].total_courses += 1;
        }
      });

      projects.forEach(project => {
        const instructorId = project.user.toString();
        if (instructorStats[instructorId]) {
          instructorStats[instructorId].total_projects += 1;
        }
      });

      // Contar estudiantes únicos por instructor
      const coursesByInstructor = {};
      courses.forEach(course => {
        const instructorId = course.user.toString();
        if (!coursesByInstructor[instructorId]) {
          coursesByInstructor[instructorId] = [];
        }
        coursesByInstructor[instructorId].push(course._id);
      });

      for (const instructorId in coursesByInstructor) {
        const courseIds = coursesByInstructor[instructorId];
        const uniqueStudents = await models.CourseStudent.distinct('user', { course: { $in: courseIds } });
        if (instructorStats[instructorId]) {
          instructorStats[instructorId].total_students = uniqueStudents.length;
        }
      }

      // Calcular ingresos
      const sales = await models.Sale.find({ status: 'Pagado' });
      
      const productsByInstructor = {};
      [...courses, ...projects].forEach(product => {
        const instructorId = product.user.toString();
        if (!productsByInstructor[instructorId]) {
          productsByInstructor[instructorId] = [];
        }
        productsByInstructor[instructorId].push(product._id.toString());
      });

      sales.forEach(sale => {
        sale.detail.forEach(item => {
          const productId = item.product.toString();
          
          // Encontrar instructor del producto
          for (const instructorId in productsByInstructor) {
            if (productsByInstructor[instructorId].includes(productId)) {
              if (instructorStats[instructorId]) {
                instructorStats[instructorId].total_revenue += item.price_unit;
              }
              break;
            }
          }
        });
      });

      // Calcular ratings
      const reviews = await models.Review.find();
      const ratingsByInstructor = {};

      reviews.forEach(review => {
        const productId = review.product.toString();
        
        // Encontrar instructor del producto
        for (const instructorId in productsByInstructor) {
          if (productsByInstructor[instructorId].includes(productId)) {
            if (!ratingsByInstructor[instructorId]) {
              ratingsByInstructor[instructorId] = [];
            }
            ratingsByInstructor[instructorId].push(review.rating);
            break;
          }
        }
      });

      for (const instructorId in ratingsByInstructor) {
        const ratings = ratingsByInstructor[instructorId];
        if (instructorStats[instructorId]) {
          instructorStats[instructorId].total_reviews = ratings.length;
          instructorStats[instructorId].avg_rating = ratings.length > 0
            ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
            : 0;
        }
      }

      const ranking = Object.values(instructorStats)
        .sort((a, b) => b.total_revenue - a.total_revenue);

      return res.status(200).json({ instructorRanking: ranking });

    } catch (error) {
      console.error("Error en instructorRanking:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Detalle de un instructor específico
   * Admin: Cualquier instructor
   * Instructor: Solo su propia información
   */
  instructorDetail: async (req, res) => {
    try {
      const user = req.user;
      const { instructor_id } = req.query;

      // Determinar qué instructor consultar
      let targetInstructorId;
      if (user.rol === 'admin' && instructor_id) {
        targetInstructorId = instructor_id;
      } else if (user.rol === 'instructor') {
        targetInstructorId = user._id;
      } else {
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      // Obtener información del instructor
      const instructor = await models.User.findById(targetInstructorId).select('-password -token');
      if (!instructor) {
        return res.status(404).json({ message: 'Instructor no encontrado' });
      }

      // Obtener cursos y proyectos
      const courses = await models.Course.find({ user: targetInstructorId }).populate('categorie');
      const projects = await models.Project.find({ user: targetInstructorId }).populate('categorie');

      const productIds = [
        ...courses.map(c => c._id.toString()),
        ...projects.map(p => p._id.toString())
      ];

      // Obtener estudiantes únicos
      const courseIds = courses.map(c => c._id);
      const uniqueStudents = await models.CourseStudent.distinct('user', { course: { $in: courseIds } });

      // Calcular ingresos por mes (últimos 12 meses)
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      
      const sales = await models.Sale.find({ 
        status: 'Pagado',
        createdAt: { $gte: twelveMonthsAgo }
      });

      const monthlyRevenue = {};
      let totalRevenue = 0;
      let totalSales = 0;

      sales.forEach(sale => {
        sale.detail.forEach(item => {
          if (productIds.includes(item.product.toString())) {
            totalRevenue += item.price_unit;
            totalSales += 1;

            // Agrupar por mes
            const monthKey = sale.createdAt.toISOString().substring(0, 7);
            if (!monthlyRevenue[monthKey]) {
              monthlyRevenue[monthKey] = 0;
            }
            monthlyRevenue[monthKey] += item.price_unit;
          }
        });
      });

      const revenueByMonth = Object.keys(monthlyRevenue).sort().map(month => ({
        month,
        revenue: monthlyRevenue[month]
      }));

      // Obtener reviews
      const reviews = await models.Review.find({ 
        product: { $in: productIds } 
      }).populate('user', 'name surname').populate('product', 'title');

      const avgRating = reviews.length > 0
        ? parseFloat((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(2))
        : 0;

      // Productos más vendidos del instructor
      const productSales = {};
      const allSales = await models.Sale.find({ status: 'Pagado' });

      allSales.forEach(sale => {
        sale.detail.forEach(item => {
          const productId = item.product.toString();
          if (productIds.includes(productId)) {
            if (!productSales[productId]) {
              productSales[productId] = {
                product_id: productId,
                sales: 0,
                revenue: 0
              };
            }
            productSales[productId].sales += 1;
            productSales[productId].revenue += item.price_unit;
          }
        });
      });

      const topProducts = Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map(stat => {
          const course = courses.find(c => c._id.toString() === stat.product_id);
          const project = projects.find(p => p._id.toString() === stat.product_id);
          const product = course || project;

          return {
            product_id: stat.product_id,
            product_type: course ? 'course' : 'project',
            title: product ? product.title : 'Desconocido',
            sales: stat.sales,
            revenue: stat.revenue
          };
        });

      return res.status(200).json({
        instructor: {
          id: instructor._id,
          name: instructor.name,
          surname: instructor.surname,
          email: instructor.email
        },
        statistics: {
          total_courses: courses.length,
          total_projects: projects.length,
          total_students: uniqueStudents.length,
          total_revenue: totalRevenue,
          total_sales: totalSales,
          avg_rating: avgRating,
          total_reviews: reviews.length
        },
        revenue_by_month: revenueByMonth,
        top_products: topProducts,
        recent_reviews: reviews.slice(0, 10).map(r => ({
          review_id: r._id,
          product_title: r.product.title,
          student_name: `${r.user.name} ${r.user.surname}`,
          rating: r.rating,
          description: r.description,
          created_at: r.createdAt
        }))
      });

    } catch (error) {
      console.error("Error en instructorDetail:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Distribución de ingresos entre instructores
   * Solo Admin
   */
  revenueDistribution: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      const instructors = await models.User.find({ rol: 'instructor' }).select('_id name surname');
      const courses = await models.Course.find({ state: 2 });
      const projects = await models.Project.find({ state: 2 });

      const productsByInstructor = {};
      
      instructors.forEach(instructor => {
        productsByInstructor[instructor._id.toString()] = {
          instructor_id: instructor._id,
          name: `${instructor.name} ${instructor.surname}`,
          revenue: 0
        };
      });

      [...courses, ...projects].forEach(product => {
        const instructorId = product.user.toString();
        if (!productsByInstructor[instructorId]) {
          productsByInstructor[instructorId] = {
            instructor_id: instructorId,
            name: 'Desconocido',
            revenue: 0
          };
        }
      });

      // Calcular ingresos
      const sales = await models.Sale.find({ status: 'Pagado' });
      let totalRevenue = 0;

      sales.forEach(sale => {
        sale.detail.forEach(item => {
          const productId = item.product.toString();
          
          // Buscar producto
          const course = courses.find(c => c._id.toString() === productId);
          const project = projects.find(p => p._id.toString() === productId);
          const product = course || project;

          if (product) {
            const instructorId = product.user.toString();
            if (productsByInstructor[instructorId]) {
              productsByInstructor[instructorId].revenue += item.price_unit;
              totalRevenue += item.price_unit;
            }
          }
        });
      });

      // Calcular porcentajes
      const distribution = Object.values(productsByInstructor)
        .filter(stat => stat.revenue > 0)
        .map(stat => ({
          ...stat,
          percentage: totalRevenue > 0 
            ? parseFloat(((stat.revenue / totalRevenue) * 100).toFixed(2))
            : 0
        }))
        .sort((a, b) => b.revenue - a.revenue);

      return res.status(200).json({
        total_revenue: totalRevenue,
        distribution
      });

    } catch (error) {
      console.error("Error en revenueDistribution:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  }
};
