import models from "../models/index.js";
// No es necesario importar 'token' porque el middleware 'verifyDashboard' ya lo maneja.

export default {
  kpis: async (req, res) => {
    try {
      // El middleware 'verifyDashboard' ya ha validado el token y ha adjuntado el usuario a req.user.
      const user = req.user;

      if (user.rol === 'admin') {
        // KPIs para el Administrador (Globales)
        const totalIncomeResult = await models.Sale.aggregate([
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]);
        const totalIncome = totalIncomeResult.length > 0 ? totalIncomeResult[0].total : 0;
        const totalStudents = await models.User.countDocuments({ rol: 'cliente' });
        const totalCourses = await models.Course.countDocuments({ state: 2 });
        const conversionRate = 4.8; // Placeholder

        const kpis = [
          { label: 'Ingresos (USD)', value: totalIncome, delta: +12.4 },
          { label: 'Estudiantes', value: totalStudents, delta: +5.1 },
          { label: 'Cursos activos', value: totalCourses, delta: +2.0 },
          { label: 'Conversión', value: conversionRate, delta: +0.7, isPct: true },
        ];
        return res.status(200).json(kpis);

      } else if (user.rol === 'instructor') {
        // KPIs para el Instructor (Personales)
        const instructorCourses = await models.Course.find({ user: user._id });
        const courseIds = instructorCourses.map(c => c._id);

        const totalStudentsResult = await models.CourseStudent.distinct('user', { course: { $in: courseIds } });
        const totalStudents = totalStudentsResult.length;

        const totalIncomeResult = await models.SaleDetail.aggregate([
          { $match: { product: { $in: courseIds } } },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]);
        const totalIncome = totalIncomeResult.length > 0 ? totalIncomeResult[0].total : 0;

        const kpis = [
          { label: 'Mis Ingresos (USD)', value: totalIncome, delta: 0 },
          { label: 'Mis Estudiantes', value: totalStudents, delta: 0 },
          { label: 'Mis Cursos', value: instructorCourses.length, delta: 0 },
          { label: 'Rating Promedio', value: 4.7, delta: 0, isPct: true }, // Placeholder
        ];
        return res.status(200).json(kpis);
      }

      // Si no es admin ni instructor, no debería tener acceso (aunque el guard ya lo previene)
      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en DashboardController.kpis:", error);
      res.status(500).send({
        message: "OCURRIÓ UN ERROR AL OBTENER LOS KPIS",
      });
    }
  },
};