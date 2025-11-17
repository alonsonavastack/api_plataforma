import models from "../../models/index.js";

export default {
  /**
   * REPORTE: Crecimiento de estudiantes
   * Admin: Todos los estudiantes
   * Instructor: Solo sus estudiantes
   */
  studentGrowth: async (req, res) => {
    try {
      const user = req.user;
      const { period = 'month' } = req.query;

      let dateFormat;
      let dateRange;
      const now = new Date();

      switch (period) {
        case 'day':
          dateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
          dateRange = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
          break;
        case 'week':
          dateFormat = { $dateToString: { format: "%Y-W%V", date: "$createdAt" } };
          dateRange = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          break;
        default: // month
          dateFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
          dateRange = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      }

      if (user.rol === 'admin') {
        const growth = await models.User.aggregate([
          { $match: { rol: 'cliente', createdAt: { $gte: dateRange } } },
          {
            $group: {
              _id: dateFormat,
              new_students: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        // Total acumulado
        const totalStudents = await models.User.countDocuments({ rol: 'cliente' });

        return res.status(200).json({ growth, totalStudents });

      } else if (user.rol === 'instructor') {
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id');
        const courseIds = instructorCourses.map(c => c._id);

        const enrollments = await models.CourseStudent.aggregate([
          { $match: { course: { $in: courseIds }, createdAt: { $gte: dateRange } } },
          {
            $group: {
              _id: dateFormat,
              new_students: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        const totalStudents = await models.CourseStudent.distinct('user', { course: { $in: courseIds } });

        return res.status(200).json({ 
          growth: enrollments, 
          totalStudents: totalStudents.length 
        });
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en studentGrowth:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Estudiantes activos vs inactivos
   * Un estudiante activo es el que ha tenido actividad en los últimos 30 días
   */
  activeStudents: async (req, res) => {
    try {
      const user = req.user;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      if (user.rol === 'admin') {
        // Estudiantes con ventas recientes
        const activeStudentIds = await models.Sale.distinct('user', {
          status: 'Pagado',
          createdAt: { $gte: thirtyDaysAgo }
        });

        const totalStudents = await models.User.countDocuments({ rol: 'cliente' });
        const activeCount = activeStudentIds.length;
        const inactiveCount = totalStudents - activeCount;

        return res.status(200).json({
          active: activeCount,
          inactive: inactiveCount,
          total: totalStudents,
          active_percentage: ((activeCount / totalStudents) * 100).toFixed(2)
        });

      } else if (user.rol === 'instructor') {
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id');
        const instructorProjects = await models.Project.find({ user: user._id }).select('_id');
        
        const productIds = [
          ...instructorCourses.map(c => c._id.toString()),
          ...instructorProjects.map(p => p._id.toString())
        ];

        // Estudiantes que compraron productos del instructor recientemente
        const recentSales = await models.Sale.find({
          status: 'Pagado',
          createdAt: { $gte: thirtyDaysAgo }
        });

        const activeStudentSet = new Set();
        recentSales.forEach(sale => {
          let hasInstructorProduct = false;
          sale.detail.forEach(item => {
            if (productIds.includes(item.product.toString())) {
              hasInstructorProduct = true;
            }
          });
          if (hasInstructorProduct) {
            activeStudentSet.add(sale.user.toString());
          }
        });

        // Total de estudiantes únicos del instructor
        const totalStudentIds = await models.CourseStudent.distinct('user', { 
          course: { $in: instructorCourses.map(c => c._id) } 
        });

        const activeCount = activeStudentSet.size;
        const totalCount = totalStudentIds.length;
        const inactiveCount = totalCount - activeCount;

        return res.status(200).json({
          active: activeCount,
          inactive: inactiveCount,
          total: totalCount,
          active_percentage: totalCount > 0 ? ((activeCount / totalCount) * 100).toFixed(2) : 0
        });
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en activeStudents:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Estudiantes por curso
   * Admin: Todos los cursos
   * Instructor: Solo sus cursos
   */
  studentsByCourse: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol === 'admin') {
        const courseStats = await models.CourseStudent.aggregate([
          {
            $group: {
              _id: '$course',
              student_count: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: 'courses',
              localField: '_id',
              foreignField: '_id',
              as: 'course'
            }
          },
          { $unwind: '$course' },
          {
            $project: {
              _id: 0,
              course_id: '$_id',
              course_title: '$course.title',
              student_count: 1
            }
          },
          { $sort: { student_count: -1 } }
        ]);

        return res.status(200).json({ courseStats });

      } else if (user.rol === 'instructor') {
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id title');
        const courseIds = instructorCourses.map(c => c._id);

        const courseStats = await models.CourseStudent.aggregate([
          { $match: { course: { $in: courseIds } } },
          {
            $group: {
              _id: '$course',
              student_count: { $sum: 1 }
            }
          },
          { $sort: { student_count: -1 } }
        ]);

        // Agregar títulos manualmente
        const courseMap = {};
        instructorCourses.forEach(c => courseMap[c._id.toString()] = c.title);

        const result = courseStats.map(stat => ({
          course_id: stat._id,
          course_title: courseMap[stat._id.toString()] || 'Desconocido',
          student_count: stat.student_count
        }));

        return res.status(200).json({ courseStats: result });
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en studentsByCourse:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Top estudiantes
   * Los que más han gastado
   */
  topStudents: async (req, res) => {
    try {
      const user = req.user;
      const { limit = 10 } = req.query;

      if (user.rol === 'admin') {
        const topStudents = await models.Sale.aggregate([
          { $match: { status: 'Pagado' } },
          {
            $group: {
              _id: '$user',
              total_purchases: { $sum: 1 },
              total_spent: { $sum: '$total' }
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'user'
            }
          },
          { $unwind: '$user' },
          {
            $project: {
              _id: 0,
              user_id: '$_id',
              name: '$user.name',
              surname: '$user.surname',
              email: '$user.email',
              total_purchases: 1,
              total_spent: 1
            }
          },
          { $sort: { total_spent: -1 } },
          { $limit: parseInt(limit) }
        ]);

        return res.status(200).json({ topStudents });

      } else if (user.rol === 'instructor') {
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id');
        const instructorProjects = await models.Project.find({ user: user._id }).select('_id');
        
        const productIds = [
          ...instructorCourses.map(c => c._id.toString()),
          ...instructorProjects.map(p => p._id.toString())
        ];

        const sales = await models.Sale.find({ status: 'Pagado' }).populate('user');

        const studentStats = {};

        sales.forEach(sale => {
          let studentSpent = 0;
          let studentPurchases = 0;

          sale.detail.forEach(item => {
            if (productIds.includes(item.product.toString())) {
              studentSpent += item.price_unit;
              studentPurchases += 1;
            }
          });

          if (studentSpent > 0) {
            const userId = sale.user._id.toString();
            if (!studentStats[userId]) {
              studentStats[userId] = {
                user_id: userId,
                name: sale.user.name,
                surname: sale.user.surname,
                email: sale.user.email,
                total_purchases: 0,
                total_spent: 0
              };
            }
            studentStats[userId].total_purchases += studentPurchases;
            studentStats[userId].total_spent += studentSpent;
          }
        });

        const topStudents = Object.values(studentStats)
          .sort((a, b) => b.total_spent - a.total_spent)
          .slice(0, parseInt(limit));

        return res.status(200).json({ topStudents });
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en topStudents:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * 📊 REPORTE COMPLETO DE ESTUDIANTES (Para el tab de estudiantes)
   * Admin: Ve todos los estudiantes
   * Instructor: Ve solo sus estudiantes (inscritos en sus cursos)
   * ✅ Devuelve datos formateados para el frontend
   */
  studentsReport: async (req, res) => {
    try {
      console.log('📊 [studentsReport] Generando reporte completo de estudiantes...');
      
      const user = req.user;
      const { start_date, end_date } = req.query;

      console.log(`   • Usuario: ${user.name} (${user.rol})`);
      console.log(`   • Fechas: ${start_date} - ${end_date}`);

      // 📅 Construir filtro de fechas
      let dateFilter = {};
      if (start_date || end_date) {
        dateFilter.createdAt = {};
        if (start_date) dateFilter.createdAt.$gte = new Date(start_date);
        if (end_date) {
          const endDateTime = new Date(end_date);
          endDateTime.setHours(23, 59, 59, 999);
          dateFilter.createdAt.$lte = endDateTime;
        }
      }

      if (user.rol === 'admin') {
        // Admin ve todos los estudiantes
        console.log('   👑 Modo Admin: Obteniendo todos los estudiantes');
        
        const students = await models.User.find({
          rol: 'cliente',
          ...dateFilter
        })
        .sort({ createdAt: -1 })
        .lean();

        // Obtener estadísticas de cada estudiante
        const enrichedStudents = [];
        
        for (const student of students) {
          // Contar cursos inscritos
          const enrolledCourses = await models.CourseStudent.countDocuments({
            user: student._id
          });

          // Calcular total gastado
          const purchases = await models.Sale.find({
            user: student._id,
            status: 'Pagado'
          });

          const totalSpent = purchases.reduce((sum, sale) => sum + sale.total, 0);
          const totalPurchases = purchases.length;

          enrichedStudents.push({
            _id: student._id,
            name: student.name,
            surname: student.surname,
            email: student.email,
            enrolledCourses,
            totalPurchases,
            totalSpent,
            dateJoined: student.createdAt
          });
        }

        console.log(`   ✅ Encontrados ${enrichedStudents.length} estudiantes`);

        // Calcular estadísticas
        const stats = {
          totalStudents: enrichedStudents.length,
          totalEnrollments: enrichedStudents.reduce((sum, s) => sum + s.enrolledCourses, 0),
          totalRevenue: enrichedStudents.reduce((sum, s) => sum + s.totalSpent, 0),
          averageSpent: enrichedStudents.length > 0 
            ? enrichedStudents.reduce((sum, s) => sum + s.totalSpent, 0) / enrichedStudents.length 
            : 0
        };

        console.log('   📊 Estadísticas:');
        console.log(`      • Total estudiantes: ${stats.totalStudents}`);
        console.log(`      • Total inscripciones: ${stats.totalEnrollments}`);
        console.log(`      • Ingresos totales: ${stats.totalRevenue.toFixed(2)}`);
        console.log(`      • Gasto promedio: ${stats.averageSpent.toFixed(2)}`);

        return res.status(200).json({
          success: true,
          students: enrichedStudents,
          stats: stats
        });

      } else if (user.rol === 'instructor') {
        // Instructor ve solo estudiantes de sus cursos
        console.log('   👨‍🏫 Modo Instructor: Filtrando por cursos propios');
        
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id title');
        const courseIds = instructorCourses.map(c => c._id);

        console.log(`   • Cursos del instructor: ${courseIds.length}`);

        // Obtener estudiantes inscritos en esos cursos
        const enrollments = await models.CourseStudent.find({
          course: { $in: courseIds },
          ...dateFilter
        })
        .populate('user', 'name surname email createdAt')
        .populate('course', 'title')
        .lean();

        // Agrupar por estudiante
        const studentMap = new Map();

        for (const enrollment of enrollments) {
          if (!enrollment.user) continue;

          const studentId = enrollment.user._id.toString();
          
          if (!studentMap.has(studentId)) {
            studentMap.set(studentId, {
              _id: enrollment.user._id,
              name: enrollment.user.name,
              surname: enrollment.user.surname,
              email: enrollment.user.email,
              dateJoined: enrollment.user.createdAt,
              enrolledCourses: [],
              totalPurchases: 0,
              totalSpent: 0
            });
          }

          const student = studentMap.get(studentId);
          student.enrolledCourses.push(enrollment.course?.title || 'Sin título');
        }

        // Calcular compras de cada estudiante (solo de productos del instructor)
        const instructorProjects = await models.Project.find({ user: user._id }).select('_id');
        const productIds = [
          ...courseIds.map(id => id.toString()),
          ...instructorProjects.map(p => p._id.toString())
        ];

        const sales = await models.Sale.find({
          status: 'Pagado',
          ...dateFilter
        }).lean();

        for (const sale of sales) {
          const studentId = sale.user.toString();
          
          if (!studentMap.has(studentId)) continue;

          let studentSpent = 0;
          let hasPurchase = false;

          sale.detail.forEach(item => {
            if (productIds.includes(item.product.toString())) {
              studentSpent += item.price_unit;
              hasPurchase = true;
            }
          });

          if (hasPurchase) {
            const student = studentMap.get(studentId);
            student.totalPurchases++;
            student.totalSpent += studentSpent;
          }
        }

        const enrichedStudents = Array.from(studentMap.values()).map(s => ({
          ...s,
          enrolledCourses: s.enrolledCourses.length
        }));

        console.log(`   ✅ Encontrados ${enrichedStudents.length} estudiantes del instructor`);

        // Calcular estadísticas
        const stats = {
          totalStudents: enrichedStudents.length,
          totalEnrollments: enrichedStudents.reduce((sum, s) => sum + s.enrolledCourses, 0),
          totalRevenue: enrichedStudents.reduce((sum, s) => sum + s.totalSpent, 0),
          averageSpent: enrichedStudents.length > 0 
            ? enrichedStudents.reduce((sum, s) => sum + s.totalSpent, 0) / enrichedStudents.length 
            : 0
        };

        console.log('   📊 Estadísticas:');
        console.log(`      • Total estudiantes: ${stats.totalStudents}`);
        console.log(`      • Total inscripciones: ${stats.totalEnrollments}`);
        console.log(`      • Ingresos totales: ${stats.totalRevenue.toFixed(2)}`);

        return res.status(200).json({
          success: true,
          students: enrichedStudents,
          stats: stats
        });
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error('❌ [studentsReport] Error:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Error al generar el reporte de estudiantes',
        error: error.message
      });
    }
  }
};
