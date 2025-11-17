import models from "../../models/index.js";

export default {
  /**
   * REPORTE: Ingresos por período (últimos 12 meses)
   * Admin: Ve todos los ingresos
   * Instructor: Ve solo sus ingresos
   * ✅ MODIFICADO: Excluye ventas reembolsadas
   */
  incomeByPeriod: async (req, res) => {
    try {
      const user = req.user;
      const { period = 'month' } = req.query; // 'day', 'week', 'month', 'year'

      // ✅ NUEVO: Obtener ventas reembolsadas
      const refundedSales = await models.Refund.find({ 
        status: 'completed',
        state: 1 
      }).distinct('sale');

      console.log(`📈 [incomeByPeriod] Excluyendo ${refundedSales.length} ventas reembolsadas`);

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
          { 
            $match: { 
              status: 'Pagado', 
              createdAt: { $gte: dateRange },
              _id: { $nin: refundedSales } // ✅ EXCLUIR reembolsadas
            } 
          },
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
          createdAt: { $gte: dateRange },
          _id: { $nin: refundedSales } // ✅ EXCLUIR reembolsadas
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
   * ✅ MODIFICADO: Excluye ventas reembolsadas
   */
  topProducts: async (req, res) => {
    try {
      const user = req.user;
      const { limit = 10 } = req.query;

      // ✅ NUEVO: Obtener ventas reembolsadas
      const refundedSales = await models.Refund.find({ 
        status: 'completed',
        state: 1 
      }).distinct('sale');

      console.log(`🏆 [topProducts] Excluyendo ${refundedSales.length} ventas reembolsadas`);

      if (user.rol === 'admin') {
        // Admin ve todos los productos
        const topProducts = await models.Sale.aggregate([
          { 
            $match: { 
              status: 'Pagado',
              _id: { $nin: refundedSales } // ✅ EXCLUIR reembolsadas
            } 
          },
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

        const sales = await models.Sale.find({ 
          status: 'Pagado',
          _id: { $nin: refundedSales } // ✅ EXCLUIR reembolsadas
        });

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
   * ✅ MODIFICADO: Excluye ventas reembolsadas
   */
  salesByCategory: async (req, res) => {
    try {
      const user = req.user;

      // ✅ NUEVO: Obtener ventas reembolsadas
      const refundedSales = await models.Refund.find({ 
        status: 'completed',
        state: 1 
      }).distinct('sale');

      console.log(`📊 [salesByCategory] Excluyendo ${refundedSales.length} ventas reembolsadas`);

      if (user.rol === 'admin') {
        // Admin ve todas las categorías
        const salesByCategory = await models.Sale.aggregate([
          { 
            $match: { 
              status: 'Pagado',
              _id: { $nin: refundedSales } // ✅ EXCLUIR reembolsadas
            } 
          },
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

        const sales = await models.Sale.find({ 
          status: 'Pagado',
          _id: { $nin: refundedSales } // ✅ EXCLUIR reembolsadas
        });

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
   * ✅ MODIFICADO: Excluye ventas reembolsadas
   */
  paymentMethods: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      // ✅ NUEVO: Obtener ventas reembolsadas
      const refundedSales = await models.Refund.find({ 
        status: 'completed',
        state: 1 
      }).distinct('sale');

      console.log(`💳 [paymentMethods] Excluyendo ${refundedSales.length} ventas reembolsadas`);

      const paymentMethods = await models.Sale.aggregate([
        { 
          $match: { 
            status: 'Pagado',
            _id: { $nin: refundedSales } // ✅ EXCLUIR reembolsadas
          } 
        },
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
   * ✅ MODIFICADO: Excluye ventas reembolsadas
   */
  periodComparison: async (req, res) => {
    try {
      const user = req.user;
      const { period = 'month' } = req.query; // 'week', 'month', 'quarter', 'year'

      // ✅ NUEVO: Obtener ventas reembolsadas
      const refundedSales = await models.Refund.find({ 
        status: 'completed',
        state: 1 
      }).distinct('sale');

      console.log(`📉 [periodComparison] Excluyendo ${refundedSales.length} ventas reembolsadas`);

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
            { 
              $match: { 
                status: 'Pagado', 
                createdAt: { $gte: start, $lte: end },
                _id: { $nin: refundedSales } // ✅ EXCLUIR reembolsadas
              } 
            },
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
            createdAt: { $gte: start, $lte: end },
            _id: { $nin: refundedSales } // ✅ EXCLUIR reembolsadas
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
  },

  /**
   * 📋 NUEVO: Lista detallada de ventas
   * Admin: Todas las ventas
   * Instructor: Solo sus ventas
   * Parámetros: start_date, end_date, status, product_type
   */
  salesList: async (req, res) => {
    try {
      const user = req.user;
      const { start_date, end_date, status, product_type } = req.query;

      // Construir filtros
      const matchFilters = { status: 'Pagado' };

      if (start_date || end_date) {
        matchFilters.createdAt = {};
        if (start_date) {
          matchFilters.createdAt.$gte = new Date(start_date);
        }
        if (end_date) {
          const endDateObj = new Date(end_date);
          endDateObj.setHours(23, 59, 59, 999);
          matchFilters.createdAt.$lte = endDateObj;
        }
      }

      // ✅ Obtener ventas reembolsadas
      const refundedSales = await models.Refund.find({ 
        status: 'completed',
        state: 1 
      }).distinct('sale');

      // ✅ EXCLUIR ventas reembolsadas
      matchFilters._id = { $nin: refundedSales };

      console.log(`📋 [salesList] Cargando ventas. Excluyendo ${refundedSales.length} reembolsadas`);

      if (user.rol === 'admin') {
        // Admin ve todas las ventas
        let sales = await models.Sale.find(matchFilters)
          .populate('user', 'name surname email')
          .sort({ createdAt: -1 });

        // Enriquecer con información de productos
        const enrichedSales = [];
        
        for (const sale of sales) {
          const saleObj = sale.toObject();
          saleObj.detail = [];

          for (const item of sale.detail) {
            let productInfo = null;
            
            if (item.product_type === 'course') {
              productInfo = await models.Course.findById(item.product)
                .populate('categorie', 'title')
                .populate('user', 'name surname')
                .select('title categorie user');
            } else if (item.product_type === 'project') {
              productInfo = await models.Project.findById(item.product)
                .populate('categorie', 'title')
                .populate('user', 'name surname')
                .select('title categorie user');
            }

            saleObj.detail.push({
              ...item,
              productDetails: productInfo ? {
                title: productInfo.title,
                category: productInfo.categorie?.title || 'Sin categoría',
                instructor: productInfo.user ? 
                  `${productInfo.user.name} ${productInfo.user.surname}` : 
                  'Desconocido'
              } : null
            });
          }

          enrichedSales.push(saleObj);
        }

        // Filtrar por tipo de producto si se especifica
        let filteredSales = enrichedSales;
        if (product_type) {
          filteredSales = enrichedSales.filter(sale => 
            sale.detail.some(item => item.product_type === product_type)
          );
        }

        return res.status(200).json({ 
          success: true,
          sales: filteredSales,
          total: filteredSales.length
        });

      } else if (user.rol === 'instructor') {
        // Instructor ve solo ventas de sus productos
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id title categorie');
        const instructorProjects = await models.Project.find({ user: user._id }).select('_id title categorie');
        
        const productIds = [
          ...instructorCourses.map(c => c._id.toString()),
          ...instructorProjects.map(p => p._id.toString())
        ];

        const allSales = await models.Sale.find(matchFilters)
          .populate('user', 'name surname email')
          .sort({ createdAt: -1 });

        // Filtrar ventas que contengan productos del instructor
        const instructorSales = [];
        
        for (const sale of allSales) {
          const relevantDetails = sale.detail.filter(item => 
            productIds.includes(item.product.toString())
          );

          if (relevantDetails.length > 0) {
            const saleObj = sale.toObject();
            saleObj.detail = relevantDetails.map(item => {
              let productInfo = null;
              
              if (item.product_type === 'course') {
                productInfo = instructorCourses.find(c => 
                  c._id.toString() === item.product.toString()
                );
              } else if (item.product_type === 'project') {
                productInfo = instructorProjects.find(p => 
                  p._id.toString() === item.product.toString()
                );
              }

              return {
                ...item,
                productDetails: productInfo ? {
                  title: productInfo.title,
                  category: productInfo.categorie?.title || 'Sin categoría',
                  instructor: `${user.name} ${user.surname}`
                } : null
              };
            });

            // Recalcular total solo con productos del instructor
            saleObj.instructorTotal = relevantDetails.reduce(
              (sum, item) => sum + item.price_unit, 0
            );

            instructorSales.push(saleObj);
          }
        }

        // Filtrar por tipo de producto si se especifica
        let filteredSales = instructorSales;
        if (product_type) {
          filteredSales = instructorSales.filter(sale => 
            sale.detail.some(item => item.product_type === product_type)
          );
        }

        return res.status(200).json({ 
          success: true,
          sales: filteredSales,
          total: filteredSales.length
        });
      }

      return res.status(403).json({ message: 'Acceso denegado' });

    } catch (error) {
      console.error("Error en salesList:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * ✅ NUEVO: REPORTE de Reembolsos
   * Estadísticas completas de reembolsos
   * Solo Admin
   */
  refundStatistics: async (req, res) => {
    try {
      console.log('📊 [refundStatistics] Generando reporte completo de reembolsos...');
      
      const user = req.user;
      const { start_date, end_date, status } = req.query;

      if (user.rol !== 'admin') {
        console.error('❌ [refundStatistics] Acceso denegado para usuario no-admin');
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      console.log(`   • Usuario: ${user.name} (${user.rol})`);
      console.log(`   • Fechas: ${start_date} - ${end_date}`);
      console.log(`   • Estado: ${status || 'todos'}`);

      // Construir filtro
      const matchFilter = { state: 1 };

      // Filtro por estado
      if (status) {
        matchFilter.status = status;
      }

      // Filtro por fechas
      if (start_date || end_date) {
        matchFilter.requestedAt = {};
        if (start_date) matchFilter.requestedAt.$gte = new Date(start_date);
        if (end_date) {
          const endDateTime = new Date(end_date);
          endDateTime.setHours(23, 59, 59, 999);
          matchFilter.requestedAt.$lte = endDateTime;
        }
      }

      // Obtener todos los reembolsos con filtro
      const refunds = await models.Refund.find(matchFilter)
        .populate('user', 'name surname email')
        .populate('course', 'title')
        .populate('project', 'title')
        .populate('sale', 'n_transaccion total')
        .sort({ requestedAt: -1 })
        .lean();

      console.log(`   📋 Reembolsos encontrados: ${refunds.length}`);

      // Total de reembolsos por estado
      const refundsByStatus = await models.Refund.aggregate([
        { $match: { state: 1 } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$originalAmount' }
          }
        }
      ]);

      // Reembolsos completados para calcular totales
      const completedRefunds = refunds.filter(r => r.status === 'completed');

      const totalRefunded = completedRefunds.reduce((sum, r) => {
        return sum + (r.calculations?.refundAmount || r.originalAmount || 0);
      }, 0);

      const totalPlatformFees = completedRefunds.reduce((sum, r) => {
        return sum + (r.calculations?.platformFee || 0);
      }, 0);

      const totalProcessingFees = completedRefunds.reduce((sum, r) => {
        return sum + (r.calculations?.processingFee || 0);
      }, 0);

      // Pendientes de aprobación
      const pendingApproval = await models.Refund.countDocuments({ 
        status: 'pending',
        state: 1 
      });

      // Formatear reembolsos para el frontend
      const formattedRefunds = refunds.map(r => ({
        _id: r._id,
        user: {
          name: r.user?.name || 'Usuario',
          surname: r.user?.surname || 'Desconocido',
          email: r.user?.email || 'Sin email'
        },
        product: r.course ? {
          type: 'course',
          title: r.course.title
        } : r.project ? {
          type: 'project',
          title: r.project.title
        } : null,
        originalAmount: r.originalAmount,
        refundAmount: r.calculations?.refundAmount || r.originalAmount,
        status: r.status,
        reason: r.reason?.type || 'No especificado',
        reasonDescription: r.reason?.description || '',
        requestedAt: r.requestedAt,
        completedAt: r.completedAt,
        transactionId: r.sale?.n_transaccion || 'N/A'
      }));

      // Calcular estadísticas
      const stats = {
        totalRefunds: refunds.length,
        totalAmount: refunds.reduce((sum, r) => sum + r.originalAmount, 0),
        totalRefunded: totalRefunded,
        pending: refunds.filter(r => r.status === 'pending').length,
        processing: refunds.filter(r => r.status === 'processing').length,
        completed: completedRefunds.length,
        rejected: refunds.filter(r => r.status === 'rejected').length
      };

      console.log('   📊 Estadísticas:');
      console.log(`      • Total reembolsos: ${stats.totalRefunds}`);
      console.log(`      • Monto total: ${stats.totalAmount.toFixed(2)}`);
      console.log(`      • Pendientes: ${stats.pending}`);
      console.log(`      • Completados: ${stats.completed}`);

      console.log('✅ [refundStatistics] Reporte generado exitosamente');

      return res.status(200).json({
        success: true,
        refunds: formattedRefunds,
        stats: stats,
        byStatus: refundsByStatus
      });

    } catch (error) {
      console.error('❌ [refundStatistics] Error:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Error al generar el reporte de reembolsos',
        error: error.message
      });
    }
  },

  /**
   * 📊 REPORTE COMPLETO DE VENTAS (Para el tab de ventas)
   * Admin: Ve todas las ventas
   * Instructor: Ve solo ventas con sus productos
   * ✅ Excluye ventas reembolsadas
   * ✅ Devuelve datos formateados para el frontend
   */
  salesReport: async (req, res) => {
    try {
      console.log('📊 [salesReport] Generando reporte completo de ventas...');
      
      const user = req.user;
      const { start_date, end_date, product_type } = req.query;

      console.log(`   • Usuario: ${user.name} (${user.rol})`);
      console.log(`   • Fechas: ${start_date} - ${end_date}`);
      console.log(`   • Tipo producto: ${product_type || 'todos'}`);

      // ✅ Obtener ventas reembolsadas para excluirlas
      const refundedSales = await models.Refund.find({
        status: 'completed',
        state: 1
      }).distinct('sale');

      console.log(`   🚫 Excluyendo ${refundedSales.length} ventas reembolsadas`);

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

      // 🔐 Filtrar según rol del usuario
      let sales;
      let allProductIdStrings = [];
      
      if (user.rol === 'admin') {
        // Admin ve todas las ventas
        console.log('   👑 Modo Admin: Obteniendo todas las ventas');
        
        sales = await models.Sale.find({
          status: 'Pagado',
          _id: { $nin: refundedSales },
          ...dateFilter
        })
        .populate('user', 'name surname email')
        .populate('detail.product', 'title _id')
        .sort({ createdAt: -1 })
        .lean();

        console.log(`   ✅ Encontradas ${sales.length} ventas totales`);

      } else if (user.rol === 'instructor') {
        // Instructor solo ve ventas con SUS productos
        console.log('   👨‍🏫 Modo Instructor: Filtrando por productos propios');
        
        const instructorCourses = await models.Course.find({ user: user._id }).select('_id title');
        const instructorProjects = await models.Project.find({ user: user._id }).select('_id title');
        
        const courseIds = instructorCourses.map(c => c._id);
        const projectIds = instructorProjects.map(p => p._id);
        const allProductIds = [...courseIds, ...projectIds];
        allProductIdStrings = allProductIds.map(id => id.toString());

        console.log(`   • Productos del instructor: ${allProductIds.length}`);

        // Obtener ventas que contengan al menos uno de sus productos
        sales = await models.Sale.find({
          status: 'Pagado',
          _id: { $nin: refundedSales },
          ...dateFilter,
          'detail.product': { $in: allProductIds }
        })
        .populate('user', 'name surname email')
        .populate('detail.product', 'title _id')
        .sort({ createdAt: -1 })
        .lean();

        console.log(`   ✅ Encontradas ${sales.length} ventas del instructor`);
      }

      // 🔄 Formatear los datos para el frontend
      console.log('   🔄 Formateando datos para el frontend...');
      
      const formattedSales = [];

      for (const sale of sales) {
        // Para cada detalle de la venta
        for (const item of sale.detail) {
          // Si es instructor, verificar que el producto sea suyo
          if (user.rol === 'instructor') {
            const productId = item.product?._id || item.product;
            const isOwn = allProductIdStrings.includes(productId.toString());
            if (!isOwn) continue; // Skip productos que no son del instructor
          }

          // Filtrar por tipo de producto si se especificó
          if (product_type && item.product_type !== product_type) {
            continue;
          }

          // Determinar si es curso o proyecto
          const isCourse = item.product_type === 'course';
          const productData = item.product || {};

          formattedSales.push({
            _id: `${sale._id}_${item._id || Math.random()}`,
            course: isCourse ? {
              _id: productData._id || productData,
              title: productData.title || item.title || 'Curso sin título'
            } : null,
            project: !isCourse ? {
              _id: productData._id || productData,
              title: productData.title || item.title || 'Proyecto sin título'
            } : null,
            user: {
              name: sale.user?.name || 'Usuario',
              surname: sale.user?.surname || 'Desconocido',
              email: sale.user?.email || 'Sin email'
            },
            salePrice: item.price_unit,
            dateCreated: sale.createdAt,
            paymentMethod: sale.method_payment || 'N/A',
            transactionId: sale.n_transaccion
          });
        }
      }

      console.log(`   ✅ Formateadas ${formattedSales.length} ventas individuales`);

      // 📊 Calcular estadísticas
      const stats = {
        totalSales: formattedSales.length,
        totalRevenue: formattedSales.reduce((sum, s) => sum + s.salePrice, 0),
        averageTicket: formattedSales.length > 0 
          ? formattedSales.reduce((sum, s) => sum + s.salePrice, 0) / formattedSales.length 
          : 0,
        coursesSales: formattedSales.filter(s => s.course).length,
        projectsSales: formattedSales.filter(s => s.project).length
      };

      console.log('   📊 Estadísticas:');
      console.log(`      • Total ventas: ${stats.totalSales}`);
      console.log(`      • Ingresos totales: ${stats.totalRevenue.toFixed(2)}`);
      console.log(`      • Ticket promedio: ${stats.averageTicket.toFixed(2)}`);
      console.log(`      • Cursos: ${stats.coursesSales}`);
      console.log(`      • Proyectos: ${stats.projectsSales}`);

      console.log('✅ [salesReport] Reporte generado exitosamente');

      res.status(200).json({
        success: true,
        sales: formattedSales,
        stats: stats
      });

    } catch (error) {
      console.error('❌ [salesReport] Error:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Error al generar el reporte de ventas',
        error: error.message
      });
    }
  }
};
