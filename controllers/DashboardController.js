import models from "../models/index.js";
import mongoose from "mongoose";
import { calculatePaymentSplit } from "../utils/commissionCalculator.js";

export default {
  // ✅ NUEVO: Métricas Financieras Ejecutivas (Con Reembolsos y Comisiones)
  executiveMetrics: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      console.log('📊 [executiveMetrics] Generando métricas financieras ejecutivas...');

      // 📅 Definir períodos
      const now = new Date();
      const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const firstDayCurrentYear = new Date(now.getFullYear(), 0, 1);

      // 🔍 CONFIGURAR FILTROS
      const { excludeTests } = req.query;
      const baseMatch = {
        status: 'Pagado',
        ...(excludeTests === 'true' ? { isTest: { $ne: true } } : {})
      };

      // 🔄 HELPER: Calcular monto de reembolsos para un set de ventas
      const calculateRefundsForSales = async (salesMatch) => {
        // 1. Encontrar IDs de ventas que coincidan con el filtro
        const sales = await models.Sale.find(salesMatch).select('_id');
        const saleIds = sales.map(s => s._id);

        if (saleIds.length === 0) return 0;

        // 2. Encontrar reembolsos completados para estas ventas
        const refunds = await models.Refund.find({
          sale: { $in: saleIds },
          status: 'completed',
          state: 1
        });

        // 3. Sumar el monto reembolsado
        return refunds.reduce((sum, r) => {
          return sum + (r.calculations?.refundAmount || r.originalAmount || 0);
        }, 0);
      };

      // 💰 1. INGRESOS BRUTOS (Total de ventas)
      const grossIncomeResult = await models.Sale.aggregate([
        { $match: baseMatch },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      const grossIncome = grossIncomeResult[0]?.total || 0;

      // 🔄 2. TOTAL REEMBOLSADO (Global)
      const totalRefunded = await calculateRefundsForSales(baseMatch);

      // 💵 3. INGRESOS NETOS (Brutos - Reembolsos)
      // ✅ CORREGIDO: Restar monto reembolsado en lugar de excluir ventas completas
      const netIncome = Math.max(0, grossIncome - totalRefunded);

      // 📊 4. DATOS DEL MES ACTUAL
      const currentMonthMatch = {
        ...baseMatch,
        createdAt: { $gte: firstDayCurrentMonth }
      };

      const currentMonthGrossResult = await models.Sale.aggregate([
        { $match: currentMonthMatch },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      const currentMonthGross = currentMonthGrossResult[0]?.total || 0;
      const currentMonthRefunded = await calculateRefundsForSales(currentMonthMatch);
      const currentMonthNet = Math.max(0, currentMonthGross - currentMonthRefunded);

      // 📊 5. DATOS DEL MES ANTERIOR
      const lastMonthMatch = {
        ...baseMatch,
        createdAt: { $gte: firstDayLastMonth, $lt: firstDayCurrentMonth }
      };

      const lastMonthGrossResult = await models.Sale.aggregate([
        { $match: lastMonthMatch },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      const lastMonthGross = lastMonthGrossResult[0]?.total || 0; // Usado para debug si se necesita
      const lastMonthRefunded = await calculateRefundsForSales(lastMonthMatch);
      const lastMonthNet = Math.max(0, lastMonthGross - lastMonthRefunded);

      // 📈 6. CALCULAR DELTA (Mes actual vs mes anterior)
      const incomeDelta = lastMonthNet > 0
        ? ((currentMonthNet - lastMonthNet) / lastMonthNet * 100).toFixed(1)
        : currentMonthNet > 0 ? 100 : 0;

      // 💳 7. COMISIONES DE LA PLATAFORMA
      // 🔥 FIX: Leer los datos REALES desde InstructorEarnings en lugar de
      //         recalcular sobre el ingreso bruto (que no descuenta fee PayPal).
      //         El flujo correcto es: Bruto → -FeePayPal → Neto → 70% Instructor / 30% Plataforma
      const commissionSettings = await models.PlatformCommissionSettings.findOne();
      const defaultCommissionRate = commissionSettings?.default_commission_rate || 30;

      // Sumar instructor_earning y platform_commission_amount reales de la BD
      const earningsAgg = await models.InstructorEarnings.aggregate([
        { $match: { status: { $ne: 'refunded' } } },
        {
          $group: {
            _id: null,
            totalInstructorEarning: { $sum: '$instructor_earning' },
            totalPlatformCommission: { $sum: '$platform_commission_amount' },
            totalPaypalFee: { $sum: '$payment_fee_amount' }
          }
        }
      ]);

      const earningsData = earningsAgg[0] || { totalInstructorEarning: 0, totalPlatformCommission: 0, totalPaypalFee: 0 };

      // Si ya tenemos datos reales en BD, usarlos; si no (sin ventas aún), calcular estimado
      let platformCommissions;
      let instructorEarnings;

      if (earningsData.totalInstructorEarning > 0 || earningsData.totalPlatformCommission > 0) {
        // ✅ Usar datos reales de la BD (ya tienen PayPal fee descontado)
        platformCommissions = parseFloat(earningsData.totalPlatformCommission.toFixed(2));
        instructorEarnings = parseFloat(earningsData.totalInstructorEarning.toFixed(2));
      } else {
        // Fallback: estimado sobre el neto (sin fee PayPal)
        const split = calculatePaymentSplit(netIncome);
        platformCommissions = parseFloat((split.netAmount * (defaultCommissionRate / 100)).toFixed(2));
        instructorEarnings = parseFloat((split.netAmount - platformCommissions).toFixed(2));
      }

      // 👥 8. CONTADORES
      const totalStudents = await models.User.countDocuments({ rol: 'cliente' });
      const totalInstructors = await models.User.countDocuments({ rol: 'instructor' });
      const totalActiveCourses = await models.Course.countDocuments({ state: 2 });
      const totalActiveProjects = await models.Project.countDocuments({ state: 2 });

      // 🔔 9. PROCESAR ALERTAS Y OTROS DATOS DE REEMBOLSOS
      const pendingRefunds = await models.Refund.countDocuments({
        status: 'pending',
        state: 1
      });

      const completedRefunds = await models.Refund.find({
        status: 'completed',
        state: 1
      });

      // Cálculo de fees retenidos (solo informativo)
      const totalPlatformFeesFromRefunds = completedRefunds.reduce((sum, r) => sum + (r.calculations?.platformFee || 0), 0);
      const totalProcessingFeesFromRefunds = completedRefunds.reduce((sum, r) => sum + (r.calculations?.processingFee || 0), 0);

      const totalSalesCount = await models.Sale.countDocuments(baseMatch);

      // Tasa de reembolso basándose en # de transacciones
      // Nota: Esto sigue siendo por # de reembolsos vs # ventas, que es estándar
      const refundRate = totalSalesCount > 0
        ? ((completedRefunds.length / totalSalesCount) * 100).toFixed(2)
        : 0;

      // 📊 11. INGRESOS DEL AÑO ACTUAL
      const currentYearMatch = {
        ...baseMatch,
        createdAt: { $gte: firstDayCurrentYear }
      };

      const currentYearGrossResult = await models.Sale.aggregate([
        { $match: currentYearMatch },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      const currentYearGross = currentYearGrossResult[0]?.total || 0;
      const currentYearRefunded = await calculateRefundsForSales(currentYearMatch);
      const currentYearNet = Math.max(0, currentYearGross - currentYearRefunded);

      // 🎯 12. ARMANDO RESPUESTA
      const metrics = {
        // INGRESOS
        income: {
          gross: {
            total: grossIncome,
            currentMonth: currentMonthGross,
            label: 'Ingresos Brutos',
            description: 'Total de ventas sin considerar reembolsos'
          },
          net: {
            total: netIncome,
            currentMonth: currentMonthNet,
            lastMonth: lastMonthNet,
            currentYear: currentYearNet,
            delta: parseFloat(incomeDelta),
            label: 'Ingresos Netos',
            description: 'Ingresos después de restar reembolsos'
          },
          difference: {
            amount: totalRefunded, // Difference is exactly the refunded amount
            percentage: grossIncome > 0 ? (totalRefunded / grossIncome * 100).toFixed(2) : 0,
            label: 'Impacto de Reembolsos'
          }
        },

        // REEMBOLSOS
        refunds: {
          total: completedRefunds.length,
          totalAmount: totalRefunded,
          platformFeesRetained: totalPlatformFeesFromRefunds,
          processingFees: totalProcessingFeesFromRefunds,
          pending: pendingRefunds,
          rate: parseFloat(refundRate),
          label: 'Reembolsos',
          description: `${refundRate}% de las ventas totales`,
          testDataExcluded: excludeTests === 'true'
        },

        // COMISIONES
        commissions: {
          platform: {
            amount: platformCommissions,
            rate: defaultCommissionRate,
            label: 'Comisiones Plataforma',
            description: `${defaultCommissionRate}% de ingresos netos`
          },
          instructors: {
            amount: instructorEarnings,
            rate: 100 - defaultCommissionRate,
            label: 'Ganancias Instructores',
            description: `${100 - defaultCommissionRate}% de ingresos netos`
          }
        },

        // CONTADORES
        counters: {
          students: totalStudents,
          instructors: totalInstructors,
          activeCourses: totalActiveCourses,
          activeProjects: totalActiveProjects,
          totalSales: totalSalesCount,
          activeSales: totalSalesCount // Ventas no se eliminan del contador, solo se ajusta el $
        },

        // ALERTAS
        alerts: [
          ...(pendingRefunds > 0 ? [{
            type: 'warning',
            message: `${pendingRefunds} reembolso(s) pendiente(s) de aprobación`,
            priority: 'high'
          }] : []),
          ...(parseFloat(refundRate) > 5 ? [{
            type: 'danger',
            message: `Tasa de reembolso alta: ${refundRate}%`,
            priority: 'high'
          }] : []),
          ...(parseFloat(incomeDelta) < -10 ? [{
            type: 'warning',
            message: `Ingresos bajaron ${Math.abs(parseFloat(incomeDelta))}% vs mes anterior`,
            priority: 'medium'
          }] : [])
        ]
      };

      console.log('✅ [executiveMetrics] Métricas generadas exitosamente');
      console.log(`   • Ingresos Brutos: ${grossIncome.toFixed(2)}`);
      console.log(`   • Reembolsos:      ${totalRefunded.toFixed(2)}`);
      console.log(`   • Ingresos Netos:  ${netIncome.toFixed(2)}`);

      return res.status(200).json(metrics);

    } catch (error) {
      console.error('❌ Error en DashboardController.executiveMetrics:', error);
      console.error('Stack:', error.stack);
      res.status(500).send({
        message: 'OCURRIÓ UN ERROR AL OBTENER LAS MÉTRICAS EJECUTIVAS'
      });
    }
  },

  // ✅ MEJORADO: KPIs ahora excluyen reembolsos
  kpis: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol === "admin") {
        // KPIs para el Administrador (Globales)

        // 🔄 OBTENER VENTAS REEMBOLSADAS
        const refundedSales = await models.Refund.find({
          status: 'completed',
          state: 1
        }).distinct('sale');

        console.log(`📊 [kpis] Excluyendo ${refundedSales.length} ventas reembolsadas`);

        // ✅ Ingresos totales EXCLUYENDO REEMBOLSOS
        const totalIncomeResult = await models.Sale.aggregate([
          {
            $match: {
              status: "Pagado",
              _id: { $nin: refundedSales } // ✅ EXCLUIR
            }
          },
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

        // ✅ Mes actual EXCLUYENDO REEMBOLSOS
        const currentMonthIncomeResult = await models.Sale.aggregate([
          {
            $match: {
              status: "Pagado",
              createdAt: { $gte: firstDayCurrentMonth },
              _id: { $nin: refundedSales } // ✅ EXCLUIR
            },
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]);
        const currentMonthIncome =
          currentMonthIncomeResult.length > 0
            ? currentMonthIncomeResult[0].total
            : 0;

        // ✅ Mes anterior EXCLUYENDO REEMBOLSOS
        const lastMonthIncomeResult = await models.Sale.aggregate([
          {
            $match: {
              status: "Pagado",
              createdAt: {
                $gte: firstDayLastMonth,
                $lt: firstDayCurrentMonth,
              },
              _id: { $nin: refundedSales } // ✅ EXCLUIR
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

        // ✅ Calcular conversión real
        const totalSales = await models.Sale.countDocuments({
          status: 'Pagado',
          _id: { $nin: refundedSales }
        });
        const conversionRate = totalStudents > 0
          ? ((totalSales / totalStudents) * 100).toFixed(1)
          : 0;

        const kpis = [
          {
            label: "Ingresos Netos (USD)",
            value: totalIncome,
            delta: parseFloat(incomeDelta),
            isCurrency: true,
          },
          { label: "Cursos Activos", value: totalActiveCourses, delta: +2.0 },
          { label: "Proyectos Activos", value: totalActiveProjects, delta: +1.5 },
          { label: "Estudiantes", value: totalStudents, delta: +5.1 },
          {
            label: "Conversión",
            value: parseFloat(conversionRate),
            delta: +0.7,
            isPct: true,
          },
        ];

        console.log(`✅ [kpis] Ingresos Netos: ${totalIncome.toFixed(2)}`);

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
            isCurrency: true, // 🔥 NUEVO
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

      console.log('📊 [listStudents] Iniciando carga de estudiantes...');
      console.log(`   • Usuario: ${user.name} (${user.rol})`);

      // 🔄 OBTENER VENTAS REEMBOLSADAS (GLOBAL)
      const refundedSales = await models.Refund.find({
        status: 'completed',
        state: 1
      }).distinct('sale');

      console.log(`   • Ventas reembolsadas a excluir: ${refundedSales.length}`);

      let studentIds;

      if (user.rol === "instructor") {
        // Para un instructor, primero encontramos a sus estudiantes a través de las ventas de sus productos
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id').lean();
        const instructorProjects = await models.Project.find({ user: user._id }).select('_id').lean();
        const productIds = [
          ...instructorCourses.map(c => c._id),
          ...instructorProjects.map(p => p._id)
        ];

        console.log(`   • Productos del instructor: ${productIds.length}`);

        // ✅ EXCLUIR VENTAS REEMBOLSADAS
        const studentIdsFromSales = await models.Sale.distinct('user', {
          status: 'Pagado',
          'detail.product': { $in: productIds },
          _id: { $nin: refundedSales }
        });

        // ✅ NUEVO: Buscar también por inscripciones (para cursos GRATIS)
        const studentIdsFromEnrollments = await models.CourseStudent.distinct('user', {
          course: { $in: instructorCourses.map(c => c._id) }
        });

        // Combinar y eliminar duplicados
        const allStudentIds = [...new Set([...studentIdsFromSales.map(id => id.toString()), ...studentIdsFromEnrollments.map(id => id.toString())])];

        // Convertir de nuevo a ObjectId
        studentIds = allStudentIds.map(id => new mongoose.Types.ObjectId(id));

        console.log(`   • Estudiantes por ventas: ${studentIdsFromSales.length}`);
        console.log(`   • Estudiantes por inscripción: ${studentIdsFromEnrollments.length}`);
        console.log(`   • Total estudiantes únicos: ${studentIds.length}`);
      }

      // La agregación ahora es más completa y funciona para ambos roles
      const aggregationPipeline = [
        // Filtrar usuarios que son clientes. Si es instructor, filtra por sus IDs de estudiante.
        { $match: { rol: "cliente", ...(studentIds && { _id: { $in: studentIds } }) } },
        // Buscar todas las ventas pagadas de este usuario (EXCLUYENDO REEMBOLSADAS)
        {
          $lookup: {
            from: "sales",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$user", "$userId"] },
                  status: "Pagado",
                  _id: { $nin: refundedSales } // 🔥 EXCLUIR REEMBOLSOS
                }
              },
              { $unwind: "$detail" } // Descomponer los detalles de la venta
            ],
            as: "purchases"
          },
        },
        // ✅ NUEVO: Buscar inscripciones a cursos (incluye GRATIS y PAGADOS)
        // Usamos sintaxis simple para evitar problemas de tipos
        {
          $lookup: {
            from: "course_students",
            localField: "_id",
            foreignField: "user",
            as: "enrollments"
          }
        },
        {
          $addFields: {
            // ✅ CORREGIDO: Contar inscripciones reales (cubre gratis y pagados)
            purchased_courses_count: { $size: "$enrollments" },

            // Contar proyectos comprados (Sigue usando ventas porque no hay "inscripción" a proyectos)
            purchased_projects_count: {
              $size: {
                $filter: { input: "$purchases", as: "p", cond: { $eq: ["$p.detail.product_type", "project"] } }
              }
            }
          },
        },
        { $project: { password: 0, token: 0, purchases: 0, enrollments: 0 } }, // Excluir campos sensibles
        { $sort: { createdAt: -1 } }
      ];

      const students = await models.User.aggregate(aggregationPipeline);

      console.log(`✅ [listStudents] Estudiantes cargados: ${students.length}`);
      if (students.length > 0) {
        const s = students[0];
        console.log(`   • Ejemplo (ID: ${s._id}):`);
        console.log(`     - Cursos (Backend): ${s.purchased_courses_count}`);
        console.log(`     - Proyectos (Backend): ${s.purchased_projects_count}`);
      }

      res.status(200).json({ students });
    } catch (error) {
      console.error("❌ Error en DashboardController.listStudents:", error);
      console.error("Stack:", error.stack);
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
