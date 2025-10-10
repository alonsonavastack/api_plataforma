import models from "../models/index.js";

export default {
  kpis: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol === 'admin') {
        // KPIs para el Administrador (Globales)
        
        // Ingresos totales solo de ventas pagadas
        const totalIncomeResult = await models.Sale.aggregate([
          { $match: { status: 'Pagado' } },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]);
        const totalIncome = totalIncomeResult.length > 0 ? totalIncomeResult[0].total : 0;

        // Calcular ingresos del mes anterior para comparación
        const now = new Date();
        const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        const currentMonthIncomeResult = await models.Sale.aggregate([
          { 
            $match: { 
              status: 'Pagado',
              createdAt: { $gte: firstDayCurrentMonth }
            } 
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]);
        const currentMonthIncome = currentMonthIncomeResult.length > 0 ? currentMonthIncomeResult[0].total : 0;

        const lastMonthIncomeResult = await models.Sale.aggregate([
          { 
            $match: { 
              status: 'Pagado',
              createdAt: { 
                $gte: firstDayLastMonth,
                $lt: firstDayCurrentMonth
              }
            } 
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]);
        const lastMonthIncome = lastMonthIncomeResult.length > 0 ? lastMonthIncomeResult[0].total : 0;

        // Calcular delta de ingresos
        const incomeDelta = lastMonthIncome > 0 
          ? ((currentMonthIncome - lastMonthIncome) / lastMonthIncome * 100).toFixed(1)
          : currentMonthIncome > 0 ? 100 : 0;

        const totalStudents = await models.User.countDocuments({ rol: 'cliente' });
        const totalCourses = await models.Course.countDocuments({ state: 2 });
        const conversionRate = 4.8; // Placeholder

        const kpis = [
          { label: 'Ingresos (USD)', value: totalIncome, delta: parseFloat(incomeDelta) },
          { label: 'Estudiantes', value: totalStudents, delta: +5.1 },
          { label: 'Cursos activos', value: totalCourses, delta: +2.0 },
          { label: 'Conversión', value: conversionRate, delta: +0.7, isPct: true },
        ];
        return res.status(200).json(kpis);

      } else if (user.rol === 'instructor') {
        // KPIs para el Instructor (Personales)
        const instructorCourses = await models.Course.find({ user: user._id });
        const courseIds = instructorCourses.map(c => c._id);

        // Encontrar proyectos del instructor
        const instructorProjects = await models.Project.find({ user: user._id });
        const projectIds = instructorProjects.map(p => p._id);

        // Combinar IDs de cursos y proyectos
        const allProductIds = [...courseIds, ...projectIds];

        // Total de estudiantes únicos en los cursos del instructor
        const totalStudentsResult = await models.CourseStudent.distinct('user', { course: { $in: courseIds } });
        const totalStudents = totalStudentsResult.length;

        // Calcular ingresos del mes actual del instructor
        const now = new Date();
        const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        // Ingresos del mes actual
        const currentMonthSales = await models.Sale.find({
          status: 'Pagado',
          createdAt: { $gte: firstDayCurrentMonth }
        });

        let currentMonthIncome = 0;
        currentMonthSales.forEach(sale => {
          sale.detail.forEach(item => {
            const productId = item.product.toString();
            if (allProductIds.some(id => id.toString() === productId)) {
              currentMonthIncome += item.price_unit;
            }
          });
        });

        // Ingresos del mes anterior
        const lastMonthSales = await models.Sale.find({
          status: 'Pagado',
          createdAt: { 
            $gte: firstDayLastMonth,
            $lt: firstDayCurrentMonth
          }
        });

        let lastMonthIncome = 0;
        lastMonthSales.forEach(sale => {
          sale.detail.forEach(item => {
            const productId = item.product.toString();
            if (allProductIds.some(id => id.toString() === productId)) {
              lastMonthIncome += item.price_unit;
            }
          });
        });

        // Ingresos totales históricos
        const allSales = await models.Sale.find({
          status: 'Pagado'
        });

        let totalIncome = 0;
        allSales.forEach(sale => {
          sale.detail.forEach(item => {
            const productId = item.product.toString();
            if (allProductIds.some(id => id.toString() === productId)) {
              totalIncome += item.price_unit;
            }
          });
        });

        // Calcular delta
        const incomeDelta = lastMonthIncome > 0 
          ? ((currentMonthIncome - lastMonthIncome) / lastMonthIncome * 100).toFixed(1)
          : currentMonthIncome > 0 ? 100 : 0;

        const kpis = [
          { label: 'Mis Ingresos (USD)', value: totalIncome, delta: parseFloat(incomeDelta) },
          { label: 'Mis Estudiantes', value: totalStudents, delta: 0 },
          { label: 'Mis Cursos', value: instructorCourses.length, delta: 0 },
          { label: 'Rating Promedio', value: 4.7, delta: 0, isPct: true }, // Placeholder
        ];
        return res.status(200).json(kpis);
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en DashboardController.kpis:", error);
      console.error("Stack:", error.stack);
      res.status(500).send({
        message: "OCURRIÓ UN ERROR AL OBTENER LOS KPIS",
      });
    }
  },

  listStudents: async (req, res) => {
    try {
      const user = req.user;

      let studentQuery = { rol: 'cliente' };

      if (user.rol === 'instructor') {
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id');
        const courseIds = instructorCourses.map(c => c._id);
        
        const studentIds = await models.CourseStudent.distinct('user', { course: { $in: courseIds } });
        studentQuery._id = { $in: studentIds };
      }

      const students = await models.User.aggregate([
        { $match: studentQuery },
        {
          $lookup: {
            from: 'coursestudents',
            localField: '_id',
            foreignField: 'user',
            as: 'enrollments'
          }
        },
        {
          $addFields: {
            course_count: { $size: '$enrollments' }
          }
        },
        { $project: { password: 0, token: 0, enrollments: 0 } }
      ]);

      res.status(200).json({ students });

    } catch (error) {
      console.error("Error en DashboardController.listStudents:", error);
      res.status(500).send({ message: "OCURRIÓ UN ERROR AL OBTENER LOS ESTUDIANTES" });
    }
  }
};
