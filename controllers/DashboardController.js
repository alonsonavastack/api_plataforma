import models from "../models/index.js";

export default {
  kpis: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol === "admin") {
        // KPIs para el Administrador (Globales)

        // Ingresos totales solo de ventas pagadas
        const totalIncomeResult = await models.Sale.aggregate([
          { $match: { status: "Pagado" } },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]);
        const totalIncome =
          totalIncomeResult.length > 0 ? totalIncomeResult[0].total : 0;

        // Calcular ingresos del mes anterior para comparación
        const now = new Date();
        const firstDayCurrentMonth = new Date(
          now.getFullYear(),
          now.getMonth(),
          1
        );
        const firstDayLastMonth = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1
        );

        const currentMonthIncomeResult = await models.Sale.aggregate([
          {
            $match: {
              status: "Pagado",
              createdAt: { $gte: firstDayCurrentMonth },
            },
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]);
        const currentMonthIncome =
          currentMonthIncomeResult.length > 0
            ? currentMonthIncomeResult[0].total
            : 0;

        const lastMonthIncomeResult = await models.Sale.aggregate([
          {
            $match: {
              status: "Pagado",
              createdAt: {
                $gte: firstDayLastMonth,
                $lt: firstDayCurrentMonth,
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]);
        const lastMonthIncome =
          lastMonthIncomeResult.length > 0 ? lastMonthIncomeResult[0].total : 0;

        // Calcular delta de ingresos
        const incomeDelta =
          lastMonthIncome > 0
            ? (
                ((currentMonthIncome - lastMonthIncome) / lastMonthIncome) *
                100
              ).toFixed(1)
            : currentMonthIncome > 0
            ? 100
            : 0;

        const totalStudents = await models.User.countDocuments({
          rol: "cliente",
        });
        const totalActiveCourses = await models.Course.countDocuments({ state: 2 });
        const totalActiveProjects = await models.Project.countDocuments({ state: 2 });
        const conversionRate = 4.8; // Placeholder

        const kpis = [
          {
            label: "Ingresos (USD)",
            value: totalIncome,
            delta: parseFloat(incomeDelta),
          },
          { label: "Cursos Activos", value: totalActiveCourses, delta: +2.0 },
          { label: "Proyectos Activos", value: totalActiveProjects, delta: +1.5 },
          { label: "Estudiantes", value: totalStudents, delta: +5.1 },
          {
            label: "Conversión",
            value: conversionRate,
            delta: +0.7,
            isPct: true,
          },
        ];
        return res.status(200).json(kpis);
      } else if (user.rol === "instructor") {
        // KPIs para el Instructor (Personales)
        const instructorCourses = await models.Course.find({ user: user._id, state: 2 });
        const courseIds = instructorCourses.map((c) => c._id);

        // Encontrar proyectos del instructor
        const instructorProjects = await models.Project.find({
          user: user._id,
          state: 2
        });
        const projectIds = instructorProjects.map((p) => p._id);

        // Combinar IDs de cursos y proyectos
        const allProductIds = [...courseIds, ...projectIds];

        // Total de estudiantes únicos en los cursos del instructor
        const totalStudentsResult = await models.CourseStudent.distinct(
          "user",
          { course: { $in: courseIds } }
        );
        const totalStudents = totalStudentsResult.length;

        // --- OPTIMIZACIÓN: Usar agregaciones para calcular ingresos ---
        const now = new Date();
        const firstDayCurrentMonth = new Date(
          now.getFullYear(),
          now.getMonth(),
          1
        );
        const firstDayLastMonth = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1
        );

        const incomeAggregation = await models.Sale.aggregate([
          {
            $match: {
              status: "Pagado",
              "detail.product": { $in: allProductIds },
            },
          },
          { $unwind: "$detail" },
          {
            $match: {
              "detail.product": { $in: allProductIds },
            },
          },
          {
            $group: {
              _id: null,
              totalIncome: { $sum: "$detail.price_unit" },
              currentMonthIncome: {
                $sum: {
                  $cond: [
                    { $gte: ["$createdAt", firstDayCurrentMonth] },
                    "$detail.price_unit",
                    0,
                  ],
                },
              },
              lastMonthIncome: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ["$createdAt", firstDayLastMonth] },
                        { $lt: ["$createdAt", firstDayCurrentMonth] },
                      ],
                    },
                    "$detail.price_unit",
                    0,
                  ],
                },
              },
            },
          },
        ]);

        const {
          totalIncome = 0,
          currentMonthIncome = 0,
          lastMonthIncome = 0,
        } = incomeAggregation[0] || {};

        // Calcular delta
        const incomeDelta =
          lastMonthIncome > 0
            ? (
                ((currentMonthIncome - lastMonthIncome) / lastMonthIncome) *
                100
              ).toFixed(1)
            : currentMonthIncome > 0
            ? 100
            : 0;

        const kpis = [
          {
            label: "Mis Ingresos (USD)",
            value: totalIncome,
            delta: parseFloat(incomeDelta),
          },
          { label: "Mis Cursos", value: instructorCourses.length, delta: 0 },
          { label: "Mis Proyectos", value: instructorProjects.length, delta: 0 },
          { label: "Mis Estudiantes", value: totalStudents, delta: 0 },
        ];
        return res.status(200).json(kpis);
      }

      return res.status(403).json({ message: "Acceso denegado" });
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

      let studentIds;

      if (user.rol === "instructor") {
        // Para un instructor, primero encontramos a sus estudiantes a través de las ventas de sus productos
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id').lean();
        const instructorProjects = await models.Project.find({ user: user._id }).select('_id').lean();
        const productIds = [
          ...instructorCourses.map(c => c._id),
          ...instructorProjects.map(p => p._id)
        ];

        studentIds = await models.Sale.distinct('user', {
          status: 'Pagado',
          'detail.product': { $in: productIds }
        });
      }

      // La agregación ahora es más completa y funciona para ambos roles
      const aggregationPipeline = [
        // Filtrar usuarios que son clientes. Si es instructor, filtra por sus IDs de estudiante.
        { $match: { rol: "cliente", ...(studentIds && { _id: { $in: studentIds } }) } },
        // Buscar todas las ventas pagadas de este usuario
        {
          $lookup: {
            from: "sales",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$user", "$$userId"] },
                  status: "Pagado"
                }
              },
              { $unwind: "$detail" } // Descomponer los detalles de la venta
            ],
            as: "purchases"
          },
        },
        {
          $addFields: {
            // Contar cursos comprados
            purchased_courses_count: {
              $size: {
                $filter: { input: "$purchases", as: "p", cond: { $eq: ["$$p.detail.product_type", "course"] } }
              }
            },
            // Contar proyectos comprados
            purchased_projects_count: {
              $size: {
                $filter: { input: "$purchases", as: "p", cond: { $eq: ["$$p.detail.product_type", "project"] } }
              }
            }
          },
        },
        { $project: { password: 0, token: 0, purchases: 0 } }, // Excluir campos sensibles
        { $sort: { createdAt: -1 } }
      ];

      const students = await models.User.aggregate(aggregationPipeline);

      res.status(200).json({ students });
    } catch (error) {
      console.error("Error en DashboardController.listStudents:", error);
      res
        .status(500)
        .send({ message: "OCURRIÓ UN ERROR AL OBTENER LOS ESTUDIANTES" });
    }
  },

  monthlyIncome: async (req, res) => {
    try {
      const user = req.user;
      const now = new Date();
      const twelveMonthsAgo = new Date(
        now.getFullYear() - 1,
        now.getMonth(),
        1
      );

      if (user.rol === "admin") {
        // Lógica para el administrador (ya optimizada)
        const monthlyData = await models.Sale.aggregate([
          {
            $match: {
              status: "Pagado",
              createdAt: { $gte: twelveMonthsAgo },
            },
          },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              total: { $sum: "$total" },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]);

        const maxAmount = Math.max(...monthlyData.map((m) => m.total), 1);
        const monthNames = [
          "Ene",
          "Feb",
          "Mar",
          "Abr",
          "May",
          "Jun",
          "Jul",
          "Ago",
          "Sep",
          "Oct",
          "Nov",
          "Dic",
        ];
        const result = monthlyData.map((item) => ({
          month: monthNames[item._id.month - 1],
          amount: item.total,
          percentage: (item.total / maxAmount) * 100,
        }));

        return res.status(200).json(result);
      } else if (user.rol === "instructor") {
        // --- LÓGICA OPTIMIZADA PARA INSTRUCTOR ---
        const instructorCourses = await models.Course.find({
          user: user._id,
        }).select("_id");
        const instructorProjects = await models.Project.find({
          user: user._id,
        }).select("_id");

        // Usar directamente los ObjectIds para la consulta
        const allProductIds = [
          ...instructorCourses.map((c) => c._id),
          ...instructorProjects.map((p) => p._id),
        ];

        const monthlyData = await models.Sale.aggregate([
          {
            $match: {
              status: "Pagado",
              createdAt: { $gte: twelveMonthsAgo },
              "detail.product": { $in: allProductIds }, // Filtrar ventas relevantes en la DB
            },
          },
          { $unwind: "$detail" }, // Descomponer el array de detalles
          {
            $match: {
              "detail.product": { $in: allProductIds }, // Volver a filtrar solo los items del instructor
            },
          },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              total: { $sum: "$detail.price_unit" }, // Sumar el precio de los items del instructor
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]);

        const maxAmount = Math.max(...monthlyData.map((m) => m.total), 1);
        const monthNames = [
          "Ene",
          "Feb",
          "Mar",
          "Abr",
          "May",
          "Jun",
          "Jul",
          "Ago",
          "Sep",
          "Oct",
          "Nov",
          "Dic",
        ];
        const result = monthlyData.map((item) => ({
          month: monthNames[item._id.month - 1], // Ajustar índice del mes
          amount: item.total,
          percentage: (item.total / maxAmount) * 100,
        }));

        return res.status(200).json(result);
      }

      return res.status(403).json({ message: "Acceso denegado" });
    } catch (error) {
      console.error("Error en DashboardController.monthlyIncome:", error);
      res.status(500).send({ message: "OCURRIÓ UN ERROR" });
    }
  },

  distribution: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol === "admin") {
        const totalCourses = await models.Course.countDocuments({ state: 2 });
        const totalProjects = await models.Project.countDocuments();

        return res.status(200).json({
          courses: totalCourses,
          projects: totalProjects,
        });
      } else if (user.rol === "instructor") {
        const totalCourses = await models.Course.countDocuments({
          user: user._id,
          state: 2,
        });
        const totalProjects = await models.Project.countDocuments({
          user: user._id,
        });

        return res.status(200).json({
          courses: totalCourses,
          projects: totalProjects,
        });
      }

      return res.status(403).json({ message: "Acceso denegado" });
    } catch (error) {
      console.error("Error en DashboardController.distribution:", error);
      res.status(500).send({ message: "OCURRIÓ UN ERROR" });
    }
  },

  // 🆕 NUEVO: Actividad reciente
  recentActivity: async (req, res) => {
    try {
      const user = req.user;
      const limit = parseInt(req.query.limit) || 10;

      if (user.rol === "admin") {
        // ADMIN ve TODA la actividad
        const sales = await models.Sale.find({ status: "Pagado" })
          .populate('user', 'name surname email')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        const activities = sales.map(sale => ({
          type: 'sale',
          user: `${sale.user?.name || ''} ${sale.user?.surname || ''}`.trim(),
          amount: sale.total,
          time: sale.createdAt,
          color: 'lime'
        }));

        return res.status(200).json(activities);
      } else if (user.rol === "instructor") {
        // INSTRUCTOR ve solo actividad de SUS cursos/proyectos
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id');
        const instructorProjects = await models.Project.find({ user: user._id }).select('_id');
        const allProductIds = [
          ...instructorCourses.map(c => c._id),
          ...instructorProjects.map(p => p._id)
        ];

        const sales = await models.Sale.find({
          status: "Pagado",
          "detail.product": { $in: allProductIds }
        })
          .populate('user', 'name surname email')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        const activities = [];
        for (const sale of sales) {
          // Filtrar solo los items del instructor
          const instructorItems = sale.detail.filter(item =>
            allProductIds.some(id => id.toString() === item.product.toString())
          );

          if (instructorItems.length > 0) {
            const totalInstructor = instructorItems.reduce((sum, item) => sum + item.price_unit, 0);
            activities.push({
              type: 'sale',
              user: `${sale.user?.name || ''} ${sale.user?.surname || ''}`.trim(),
              amount: totalInstructor,
              time: sale.createdAt,
              color: 'lime'
            });
          }
        }

        return res.status(200).json(activities);
      }

      return res.status(403).json({ message: "Acceso denegado" });
    } catch (error) {
      console.error("Error en DashboardController.recentActivity:", error);
      res.status(500).send({ message: "OCURRIÓ UN ERROR" });
    }
  },
};
