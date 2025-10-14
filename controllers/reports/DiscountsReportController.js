import models from "../../models/index.js";

export default {
  /**
   * REPORTE: Efectividad de cupones
   * Solo Admin puede ver todos los cupones
   */
  couponEffectiveness: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      const coupons = await models.Cupone.find();
      
      // Obtener ventas que usaron cupones
      const salesWithCoupons = await models.Sale.find({
        status: 'Pagado',
        'detail.code_cupon': { $exists: true, $ne: null }
      });

      const couponStats = {};

      // Inicializar stats para todos los cupones
      coupons.forEach(coupon => {
        couponStats[coupon.code] = {
          coupon_id: coupon._id,
          code: coupon.code,
          type_discount: coupon.type_discount,
          discount: coupon.discount,
          num_use: coupon.num_use || 0,
          num_use_total: coupon.num_use_total || 0,
          total_uses: 0,
          total_revenue: 0,
          total_discount_given: 0
        };
      });

      // Procesar ventas con cupones
      salesWithCoupons.forEach(sale => {
        sale.detail.forEach(item => {
          if (item.code_cupon && couponStats[item.code_cupon]) {
            couponStats[item.code_cupon].total_uses += 1;
            couponStats[item.code_cupon].total_revenue += item.price_unit;
            
            // Calcular descuento otorgado
            if (item.type_discount === 1) { // Porcentaje
              const originalPrice = item.price_unit / (1 - (item.discount * 0.01));
              couponStats[item.code_cupon].total_discount_given += (originalPrice - item.price_unit);
            } else { // Monto fijo
              couponStats[item.code_cupon].total_discount_given += item.discount;
            }
          }
        });
      });

      // Calcular ROI para cada cupón
      const couponReport = Object.values(couponStats)
        .map(stat => ({
          ...stat,
          roi: stat.total_discount_given > 0 
            ? ((stat.total_revenue / stat.total_discount_given) * 100).toFixed(2)
            : 0,
          usage_rate: stat.num_use_total > 0
            ? ((stat.total_uses / stat.num_use_total) * 100).toFixed(2)
            : 0
        }))
        .sort((a, b) => b.total_revenue - a.total_revenue);

      return res.status(200).json({ couponReport });

    } catch (error) {
      console.error("Error en couponEffectiveness:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Descuentos otorgados vs Ingresos generados
   */
  discountsImpact: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      const { start_date, end_date } = req.query;
      
      let dateQuery = { status: 'Pagado' };
      if (start_date && end_date) {
        dateQuery.createdAt = {
          $gte: new Date(start_date),
          $lte: new Date(end_date)
        };
      }

      const sales = await models.Sale.find(dateQuery);

      let totalRevenue = 0;
      let totalDiscount = 0;
      let salesWithDiscount = 0;
      let salesWithoutDiscount = 0;

      sales.forEach(sale => {
        let saleHasDiscount = false;
        
        sale.detail.forEach(item => {
          totalRevenue += item.price_unit;
          
          if (item.discount && item.discount > 0) {
            saleHasDiscount = true;
            
            if (item.type_discount === 1) { // Porcentaje
              const originalPrice = item.price_unit / (1 - (item.discount * 0.01));
              totalDiscount += (originalPrice - item.price_unit);
            } else { // Monto fijo
              totalDiscount += item.discount;
            }
          }
        });

        if (saleHasDiscount) {
          salesWithDiscount += 1;
        } else {
          salesWithoutDiscount += 1;
        }
      });

      const estimatedFullPrice = totalRevenue + totalDiscount;
      const discountPercentage = estimatedFullPrice > 0 
        ? ((totalDiscount / estimatedFullPrice) * 100).toFixed(2)
        : 0;

      return res.status(200).json({
        total_revenue: totalRevenue,
        total_discount_given: totalDiscount,
        estimated_full_price: estimatedFullPrice,
        discount_percentage: parseFloat(discountPercentage),
        sales_with_discount: salesWithDiscount,
        sales_without_discount: salesWithoutDiscount
      });

    } catch (error) {
      console.error("Error en discountsImpact:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  },

  /**
   * REPORTE: Campañas de descuento (flash, normal, banner)
   * Rendimiento por tipo de campaña
   */
  campaignPerformance: async (req, res) => {
    try {
      const user = req.user;

      if (user.rol !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado' });
      }

      const sales = await models.Sale.find({ status: 'Pagado' });

      const campaignStats = {
        1: { name: 'Normal', sales: 0, revenue: 0, discount_given: 0 }, // campaign_discount: 1
        2: { name: 'Flash', sales: 0, revenue: 0, discount_given: 0 },  // campaign_discount: 2
        3: { name: 'Banner', sales: 0, revenue: 0, discount_given: 0 }, // campaign_discount: 3
        null: { name: 'Sin campaña', sales: 0, revenue: 0, discount_given: 0 }
      };

      sales.forEach(sale => {
        sale.detail.forEach(item => {
          const campaign = item.campaign_discount || null;
          
          if (campaignStats[campaign]) {
            campaignStats[campaign].sales += 1;
            campaignStats[campaign].revenue += item.price_unit;
            
            if (item.discount && item.discount > 0) {
              if (item.type_discount === 1) { // Porcentaje
                const originalPrice = item.price_unit / (1 - (item.discount * 0.01));
                campaignStats[campaign].discount_given += (originalPrice - item.price_unit);
              } else { // Monto fijo
                campaignStats[campaign].discount_given += item.discount;
              }
            }
          }
        });
      });

      const campaignReport = Object.keys(campaignStats).map(key => ({
        campaign_type: key === 'null' ? null : parseInt(key),
        campaign_name: campaignStats[key].name,
        total_sales: campaignStats[key].sales,
        total_revenue: campaignStats[key].revenue,
        total_discount_given: campaignStats[key].discount_given,
        roi: campaignStats[key].discount_given > 0
          ? ((campaignStats[key].revenue / campaignStats[key].discount_given) * 100).toFixed(2)
          : 0
      }));

      return res.status(200).json({ campaignReport });

    } catch (error) {
      console.error("Error en campaignPerformance:", error);
      res.status(500).send({ message: 'OCURRIÓ UN ERROR' });
    }
  }
};
