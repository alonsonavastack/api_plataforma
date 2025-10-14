import models from "../../models/index.js";

export default {
  /**
   * REPORTE: Ingresos por período (últimos 12 meses)
   * Admin: Ve todos los ingresos
   * Instructor: Ve solo sus ingresos
   */
  incomeByPeriod: async (req, res) => {
    try {
      const user = req.user;
      const { period = 'month' } = req.query; // 'day', 'week', 'month', 'year'

      // Definir el formato de agrupación según el período
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
        case 'year':
          dateFormat = { $dateToString: { format: "%Y", date: "$createdAt" } };
          dateRange = new Date(now.getFullYear() - 5, 0, 1);
          break;
        default: // month
          dateFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
          dateRange = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      }

      if (user.rol === 'admin') {
        // Admin ve todos los ingresos
        const incomeData = await models.Sale.aggregate([
          { $match: { status: 'Pagado', createdAt: { $gte: dateRange } } },
          {
            $group: {
              _id: dateFormat,
              total: { $sum: "$total" },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        return res.status(200).json({ incomeData });

      } else if (user.rol === 'instructor') {
        // Instructor ve solo sus ingresos
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id');
        const instructorProjects = await models.Project.find({ user: user._id }).select('_id');
        
        const courseIds = instructorCourses.map(c => c._id.toString());
        const projectIds = instructorProjects.map(p => p._id.toString());
        const allProductIds = [...courseIds, ...projectIds];

        const sales = await models.Sale.find({
          status: 'Pagado',
          createdAt: { $gte: dateRange }
        });

        // Filtrar ventas del instructor y agrupar por período
        const incomeMap = {};
        
        sales.forEach(sale => {
          let instructorIncome = 0;
          sale.detail.forEach(item => {
            if (allProductIds.includes(item.product.toString())) {
              instructorIncome += item.price_unit;
            }
          });

          if (instructorIncome > 0) {
            const dateKey = sale.createdAt.toISOString().substring(0, period === 'day' ? 10 : 7);
            if (!incomeMap[dateKey]) {
              incomeMap[dateKey] = { total: 0, count: 0 };
            }
            incomeMap[dateKey].total += instructorIncome;
            incomeMap[dateKey].count += 1;
          }
        });

        const incomeData = Object.keys(incomeMap).sort().map(key => ({
          _id: key,
          total: incomeMap[key].total,
          count: incomeMap[key].count
        }));

        return res.status(200).json({ incomeData });
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en incomeByPeriod:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Top productos más vendidos
   * Admin: Todos los productos
   * Instructor: Solo sus productos
   */
  topProducts: async (req, res) => {
    try {
      const user = req.user;
      const { limit = 10 } = req.query;

      if (user.rol === 'admin') {
        // Admin ve todos los productos
        const topProducts = await models.Sale.aggregate([
          { $match: { status: 'Pagado' } },
          { $unwind: '$detail' },
          {
            $group: {
              _id: {
                product: '$detail.product',
                product_type: '$detail.product_type',
                title: '$detail.title'
              },
              total_sales: { $sum: 1 },
              total_revenue: { $sum: '$detail.price_unit' }
            }
          },
          { $sort: { total_sales: -1 } },
          { $limit: parseInt(limit) },
          {
            $project: {
              _id: 0,
              product_id: '$_id.product',
              product_type: '$_id.product_type',
              title: '$_id.title',
              total_sales: 1,
              total_revenue: 1
            }
          }
        ]);

        return res.status(200).json({ topProducts });

      } else if (user.rol === 'instructor') {
        // Instructor ve solo sus productos
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id title');
        const instructorProjects = await models.Project.find({ user: user._id }).select('_id title');
        
        const courseMap = {};
        const projectMap = {};
        
        instructorCourses.forEach(c => courseMap[c._id.toString()] = c.title);
        instructorProjects.forEach(p => projectMap[p._id.toString()] = p.title);

        const allProductIds = [...Object.keys(courseMap), ...Object.keys(projectMap)];

        const sales = await models.Sale.find({ status: 'Pagado' });

        const productStats = {};
        
        sales.forEach(sale => {
          sale.detail.forEach(item => {
            const productId = item.product.toString();
            if (allProductIds.includes(productId)) {
              if (!productStats[productId]) {
                productStats[productId] = {
                  product_id: productId,
                  product_type: item.product_type,
                  title: item.title,
                  total_sales: 0,
                  total_revenue: 0
                };
              }
              productStats[productId].total_sales += 1;
              productStats[productId].total_revenue += item.price_unit;
            }
          });
        });

        const topProducts = Object.values(productStats)
          .sort((a, b) => b.total_sales - a.total_sales)
          .slice(0, parseInt(limit));

        return res.status(200).json({ topProducts });
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en topProducts:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Ventas por categoría
   * Admin: Todas las categorías
   * Instructor: Solo categorías de sus productos
   */
  salesByCategory: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol === 'admin') {
        // Admin ve todas las categorías
        const salesByCategory = await models.Sale.aggregate([
          { $match: { status: 'Pagado' } },
          { $unwind: '$detail' },
          {
            $lookup: {
              from: 'courses',
              localField: 'detail.product',
              foreignField: '_id',
              as: 'course'
            }
          },
          {
            $lookup: {
              from: 'projects',
              localField: 'detail.product',
              foreignField: '_id',
              as: 'project'
            }
          },
          {
            $addFields: {
              product_data: {
                $cond: {
                  if: { $eq: ['$detail.product_type', 'course'] },
                  then: { $arrayElemAt: ['$course', 0] },
                  else: { $arrayElemAt: ['$project', 0] }
                }
              }
            }
          },
          {
            $lookup: {
              from: 'categories',
              localField: 'product_data.categorie',
              foreignField: '_id',
              as: 'category'
            }
          },
          { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: {
                category_id: '$category._id',
                category_title: '$category.title'
              },
              total_sales: { $sum: 1 },
              total_revenue: { $sum: '$detail.price_unit' }
            }
          },
          { $sort: { total_revenue: -1 } },
          {
            $project: {
              _id: 0,
              category_id: '$_id.category_id',
              category_title: { $ifNull: ['$_id.category_title', 'Sin categoría'] },
              total_sales: 1,
              total_revenue: 1
            }
          }
        ]);

        return res.status(200).json({ salesByCategory });

      } else if (user.rol === 'instructor') {
        // Instructor ve solo sus categorías
        const instructorCourses = await models.Course.find({ user: user._id }).populate('categorie');
        const instructorProjects = await models.Project.find({ user: user._id }).populate('categorie');
        
        const productIds = [
          ...instructorCourses.map(c => c._id.toString()),
          ...instructorProjects.map(p => p._id.toString())
        ];

        const sales = await models.Sale.find({ status: 'Pagado' });

        const categoryStats = {};

        sales.forEach(sale => {
          sale.detail.forEach(item => {
            if (productIds.includes(item.product.toString())) {
              // Buscar el producto para obtener su categoría
              let product = instructorCourses.find(c => c._id.toString() === item.product.toString());
              if (!product) {
                product = instructorProjects.find(p => p._id.toString() === item.product.toString());
              }

              if (product && product.categorie) {
                const catId = product.categorie._id.toString();
                const catTitle = product.categorie.title;

                if (!categoryStats[catId]) {
                  categoryStats[catId] = {
                    category_id: catId,
                    category_title: catTitle,
                    total_sales: 0,
                    total_revenue: 0
                  };
                }
                categoryStats[catId].total_sales += 1;
                categoryStats[catId].total_revenue += item.price_unit;
              }
            }
          });
        });

        const salesByCategory = Object.values(categoryStats)
          .sort((a, b) => b.total_revenue - a.total_revenue);

        return res.status(200).json({ salesByCategory });
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en salesByCategory:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Métodos de pago más usados
   * Solo Admin
   */
  paymentMethods: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      const paymentMethods = await models.Sale.aggregate([
        { $match: { status: 'Pagado' } },
        {
          $group: {
            _id: '$method_payment',
            total_transactions: { $sum: 1 },
            total_revenue: { $sum: '$total' }
          }
        },
        { $sort: { total_revenue: -1 } },
        {
          $project: {
            _id: 0,
            method: '$_id',
            total_transactions: 1,
            total_revenue: 1
          }
        }
      ]);

      return res.status(200).json({ paymentMethods });

    } catch (error) {
      console.error("Error en paymentMethods:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Comparativa de períodos
   * Compara ventas actuales vs período anterior
   */
  periodComparison: async (req, res) => {
    try {
      const user = req.user;
      const { period = 'month' } = req.query; // 'week', 'month', 'quarter', 'year'

      const now = new Date();
      let currentStart, currentEnd, previousStart, previousEnd;

      switch (period) {
        case 'week':
          currentEnd = now;
          currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          previousEnd = new Date(currentStart);
          previousStart = new Date(currentStart.getFullYear(), currentStart.getMonth(), currentStart.getDate() - 7);
          break;
        case 'quarter':
          const currentQuarter = Math.floor(now.getMonth() / 3);
          currentStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
          currentEnd = now;
          previousStart = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);
          previousEnd = new Date(now.getFullYear(), currentQuarter * 3, 0);
          break;
        case 'year':
          currentStart = new Date(now.getFullYear(), 0, 1);
          currentEnd = now;
          previousStart = new Date(now.getFullYear() - 1, 0, 1);
          previousEnd = new Date(now.getFullYear() - 1, 11, 31);
          break;
        default: // month
          currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
          currentEnd = now;
          previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      }

      const getStats = async (start, end) => {
        if (user.rol === 'admin') {
          const result = await models.Sale.aggregate([
            { $match: { status: 'Pagado', createdAt: { $gte: start, $lte: end } } },
            {
              $group: {
                _id: null,
                total_sales: { $sum: 1 },
                total_revenue: { $sum: '$total' }
              }
            }
          ]);
          return result[0] || { total_sales: 0, total_revenue: 0 };
        } else if (user.rol === 'instructor') {
          const instructorCourses = await models.Course.find({ user: user._id }).select('_id');
          const instructorProjects = await models.Project.find({ user: user._id }).select('_id');
          
          const productIds = [
            ...instructorCourses.map(c => c._id.toString()),
            ...instructorProjects.map(p => p._id.toString())
          ];

          const sales = await models.Sale.find({
            status: 'Pagado',
            createdAt: { $gte: start, $lte: end }
          });

          let total_sales = 0;
          let total_revenue = 0;

          sales.forEach(sale => {
            let hasSale = false;
            let revenue = 0;
            sale.detail.forEach(item => {
              if (productIds.includes(item.product.toString())) {
                hasSale = true;
                revenue += item.price_unit;
              }
            });
            if (hasSale) {
              total_sales += 1;
              total_revenue += revenue;
            }
          });

          return { total_sales, total_revenue };
        }
      };

      const currentPeriod = await getStats(currentStart, currentEnd);
      const previousPeriod = await getStats(previousStart, previousEnd);

      // Calcular deltas
      const salesGrowth = previousPeriod.total_sales > 0 
        ? ((currentPeriod.total_sales - previousPeriod.total_sales) / previousPeriod.total_sales * 100).toFixed(2)
        : currentPeriod.total_sales > 0 ? 100 : 0;

      const revenueGrowth = previousPeriod.total_revenue > 0 
        ? ((currentPeriod.total_revenue - previousPeriod.total_revenue) / previousPeriod.total_revenue * 100).toFixed(2)
        : currentPeriod.total_revenue > 0 ? 100 : 0;

      return res.status(200).json({
        period,
        current: currentPeriod,
        previous: previousPeriod,
        growth: {
          sales: parseFloat(salesGrowth),
          revenue: parseFloat(revenueGrowth)
        }
      });

    } catch (error) {
      console.error("Error en periodComparison:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  }
};
