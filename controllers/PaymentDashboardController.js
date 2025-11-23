// controllers/PaymentDashboardController.js
// 📊 DASHBOARD COMPLETO DE ADMINISTRACIÓN DE PAGOS

import Sale from '../models/Sale.js';
import Wallet from '../models/Wallet.js';
import User from '../models/User.js';
import Refund from '../models/Refund.js';
import mongoose from 'mongoose';

const PaymentDashboardController = {

  /**
   * 📊 OBTENER ESTADÍSTICAS GENERALES DEL DASHBOARD
   * GET /api/payment-dashboard/stats
   */
  getGeneralStats: async (req, res) => {
    try {
      console.log('📊 [PaymentDashboard] Obteniendo estadísticas generales');

      // Fecha de hace 30 días para estadísticas recientes
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // 1. ESTADÍSTICAS DE VENTAS POR ESTADO
      const salesByStatus = await Sale.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total_amount: { $sum: '$total' }
          }
        }
      ]);

      // 2. VENTAS POR MÉTODO DE PAGO
      const salesByMethod = await Sale.aggregate([
        {
          $group: {
            _id: '$method_payment',
            count: { $sum: 1 },
            total_amount: { $sum: '$total' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // 3. ESTADÍSTICAS DE BILLETERAS
      const walletStats = await Wallet.aggregate([
        {
          $group: {
            _id: null,
            total_balance: { $sum: '$balance' },
            total_wallets: { $sum: 1 },
            avg_balance: { $avg: '$balance' },
            max_balance: { $max: '$balance' }
          }
        }
      ]);

      // 4. TOP 10 USUARIOS CON MÁS SALDO
      const topWallets = await Wallet.find()
        .sort({ balance: -1 })
        .limit(10)
        .populate('user', 'name surname email avatar')
        .lean();

      // 5. REEMBOLSOS
      const refundStats = await Refund.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total_amount: { $sum: '$amount' }
          }
        }
      ]);

      // 6. TRANSFERENCIAS PENDIENTES (ALERTA)
      const pendingTransfers = await Sale.countDocuments({
        method_payment: 'transfer',
        status: 'Pendiente'
      });

      // 7. VENTAS ÚLTIMOS 30 DÍAS
      const recentSales = await Sale.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo },
            status: 'Pagado'
          }
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total_amount: { $sum: '$total' }
          }
        }
      ]);

      // 8. VENTAS POR DÍA (últimos 7 días)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const salesByDay = await Sale.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo },
            status: 'Pagado'
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 },
            total: { $sum: '$total' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Formatear respuesta
      const formattedStats = {
        sales: {
          byStatus: {
            pending: salesByStatus.find(s => s._id === 'Pendiente') || { count: 0, total_amount: 0 },
            paid: salesByStatus.find(s => s._id === 'Pagado') || { count: 0, total_amount: 0 },
            cancelled: salesByStatus.find(s => s._id === 'Cancelado') || { count: 0, total_amount: 0 }
          },
          byMethod: salesByMethod.map(m => ({
            method: m._id,
            count: m.count,
            total_amount: m.total_amount,
            percentage: 0 // Se calculará en frontend
          })),
          recent: recentSales[0] || { count: 0, total_amount: 0 },
          byDay: salesByDay
        },
        wallets: {
          total_balance: walletStats[0]?.total_balance || 0,
          total_wallets: walletStats[0]?.total_wallets || 0,
          avg_balance: walletStats[0]?.avg_balance || 0,
          max_balance: walletStats[0]?.max_balance || 0,
          top_users: topWallets
        },
        refunds: {
          byStatus: {
            pending: refundStats.find(r => r._id === 'pending') || { count: 0, total_amount: 0 },
            approved: refundStats.find(r => r._id === 'approved') || { count: 0, total_amount: 0 },
            rejected: refundStats.find(r => r._id === 'rejected') || { count: 0, total_amount: 0 }
          }
        },
        alerts: {
          pending_transfers: pendingTransfers,
          pending_refunds: (refundStats.find(r => r._id === 'pending') || { count: 0 }).count
        }
      };

      console.log('✅ [PaymentDashboard] Estadísticas generadas');

      res.status(200).send(formattedStats);

    } catch (error) {
      console.error('❌ [PaymentDashboard] Error al obtener estadísticas:', error);
      res.status(500).send({
        message: 'Error al obtener estadísticas',
        error: error.message
      });
    }
  },

  /**
   * 📋 LISTAR TODAS LAS VENTAS CON FILTROS
   * GET /api/payment-dashboard/sales
   * Query: status, method_payment, dateFrom, dateTo, userId, instructorId, page, limit
   */
  listSales: async (req, res) => {
    try {
      console.log('📋 [PaymentDashboard] Listando ventas con filtros');

      const {
        status,
        method_payment,
        dateFrom,
        dateTo,
        userId,
        search,
        page = 1,
        limit = 20
      } = req.query;

      // Construir query
      let query = {};

      if (status) query.status = status;
      if (method_payment) query.method_payment = method_payment;
      if (userId) query.user = userId;

      // Filtro por fecha
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = endDate;
        }
      }

      // Calcular skip para paginación
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Obtener ventas
      let salesQuery = Sale.find(query)
        .populate('user', 'name surname email avatar')
        .populate('detail.product')
        .populate('transfer_receipt.admin_verification.verified_by', 'name surname')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const [sales, totalCount] = await Promise.all([
        salesQuery.lean().exec(),
        Sale.countDocuments(query)
      ]);

      // Si hay búsqueda, filtrar por nombre/email del usuario
      let filteredSales = sales;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredSales = sales.filter(sale => {
          const userName = `${sale.user?.name || ''} ${sale.user?.surname || ''}`.toLowerCase();
          const userEmail = (sale.user?.email || '').toLowerCase();
          const transactionNumber = (sale.n_transaccion || '').toLowerCase();
          return userName.includes(searchLower) || 
                 userEmail.includes(searchLower) || 
                 transactionNumber.includes(searchLower);
        });
      }

      console.log(`✅ [PaymentDashboard] ${filteredSales.length} ventas encontradas`);

      res.status(200).send({
        sales: filteredSales,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / parseInt(limit))
        }
      });

    } catch (error) {
      console.error('❌ [PaymentDashboard] Error al listar ventas:', error);
      res.status(500).send({
        message: 'Error al listar ventas',
        error: error.message
      });
    }
  },

  /**
   * 📈 OBTENER ANÁLISIS DE MÉTODOS DE PAGO
   * GET /api/payment-dashboard/payment-methods-analysis
   */
  getPaymentMethodsAnalysis: async (req, res) => {
    try {
      console.log('📈 [PaymentDashboard] Analizando métodos de pago');

      const { months = 6 } = req.query;
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - parseInt(months));

      // Análisis por método de pago en el tiempo
      const analysis = await Sale.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'Pagado'
          }
        },
        {
          $group: {
            _id: {
              method: '$method_payment',
              month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
            },
            count: { $sum: 1 },
            total: { $sum: '$total' }
          }
        },
        { $sort: { '_id.month': 1 } }
      ]);

      // Totales por método
      const totals = await Sale.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'Pagado'
          }
        },
        {
          $group: {
            _id: '$method_payment',
            count: { $sum: 1 },
            total: { $sum: '$total' }
          }
        },
        { $sort: { total: -1 } }
      ]);

      // Calcular porcentajes
      const grandTotal = totals.reduce((sum, t) => sum + t.count, 0);
      const totalsWithPercentage = totals.map(t => ({
        ...t,
        percentage: grandTotal > 0 ? ((t.count / grandTotal) * 100).toFixed(1) : 0
      }));

      res.status(200).send({
        analysis,
        totals: totalsWithPercentage,
        period: {
          start: startDate,
          end: new Date(),
          months: parseInt(months)
        }
      });

    } catch (error) {
      console.error('❌ [PaymentDashboard] Error en análisis:', error);
      res.status(500).send({
        message: 'Error al analizar métodos de pago',
        error: error.message
      });
    }
  },

  /**
   * 💰 OBTENER ESTADÍSTICAS DE BILLETERAS DETALLADAS
   * GET /api/payment-dashboard/wallets-stats
   */
  getWalletsStats: async (req, res) => {
    try {
      console.log('💰 [PaymentDashboard] Obteniendo estadísticas de billeteras');

      // Distribución de saldos
      const distribution = await Wallet.aggregate([
        {
          $bucket: {
            groupBy: '$balance',
            boundaries: [0, 10, 50, 100, 500, 1000, Infinity],
            default: 'Other',
            output: {
              count: { $sum: 1 },
              total: { $sum: '$balance' }
            }
          }
        }
      ]);

      // Top 20 usuarios
      const topUsers = await Wallet.find({ balance: { $gt: 0 } })
        .sort({ balance: -1 })
        .limit(20)
        .populate('user', 'name surname email avatar')
        .lean();

      // Transacciones recientes (todas las billeteras)
      const recentTransactions = await Wallet.aggregate([
        { $unwind: '$transactions' },
        { $sort: { 'transactions.createdAt': -1 } },
        { $limit: 50 },
        {
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        {
          $project: {
            _id: '$transactions._id',
            type: '$transactions.type',
            amount: '$transactions.amount',
            description: '$transactions.description',
            createdAt: '$transactions.createdAt',
            user: { $arrayElemAt: ['$userInfo', 0] }
          }
        }
      ]);

      // Estadísticas generales
      const generalStats = await Wallet.aggregate([
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$balance' },
            totalWallets: { $sum: 1 },
            avgBalance: { $avg: '$balance' },
            maxBalance: { $max: '$balance' },
            minBalance: { $min: '$balance' },
            walletsWithBalance: {
              $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] }
            }
          }
        }
      ]);

      res.status(200).send({
        general: generalStats[0] || {},
        distribution,
        topUsers,
        recentTransactions: recentTransactions.map(t => ({
          ...t,
          user: t.user ? {
            _id: t.user._id,
            name: t.user.name,
            surname: t.user.surname,
            email: t.user.email,
            avatar: t.user.avatar
          } : null
        }))
      });

    } catch (error) {
      console.error('❌ [PaymentDashboard] Error en estadísticas de billeteras:', error);
      res.status(500).send({
        message: 'Error al obtener estadísticas de billeteras',
        error: error.message
      });
    }
  },

  /**
   * 🔄 OBTENER RESUMEN DE REEMBOLSOS
   * GET /api/payment-dashboard/refunds-summary
   */
  getRefundsSummary: async (req, res) => {
    try {
      console.log('🔄 [PaymentDashboard] Obteniendo resumen de reembolsos');

      // Reembolsos por estado
      const byStatus = await Refund.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$amount' }
          }
        }
      ]);

      // Reembolsos por mes (últimos 6 meses)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const byMonth = await Refund.aggregate([
        {
          $match: {
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              status: '$status'
            },
            count: { $sum: 1 },
            total: { $sum: '$amount' }
          }
        },
        { $sort: { '_id.month': 1 } }
      ]);

      // Reembolsos pendientes de revisión
      const pendingRefunds = await Refund.find({ status: 'pending' })
        .populate('user', 'name surname email')
        .populate('sale')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      res.status(200).send({
        byStatus,
        byMonth,
        pendingRefunds
      });

    } catch (error) {
      console.error('❌ [PaymentDashboard] Error en resumen de reembolsos:', error);
      res.status(500).send({
        message: 'Error al obtener resumen de reembolsos',
        error: error.message
      });
    }
  },

  /**
   * 📤 EXPORTAR VENTAS A CSV
   * GET /api/payment-dashboard/export-sales
   */
  exportSales: async (req, res) => {
    try {
      console.log('📤 [PaymentDashboard] Exportando ventas a CSV');

      const { status, method_payment, dateFrom, dateTo } = req.query;

      let query = {};
      if (status) query.status = status;
      if (method_payment) query.method_payment = method_payment;
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      const sales = await Sale.find(query)
        .populate('user', 'name surname email')
        .sort({ createdAt: -1 })
        .lean();

      // Crear CSV
      const headers = [
        'ID',
        'Fecha',
        'Usuario',
        'Email',
        'Método de Pago',
        'Estado',
        'Total',
        'Wallet Usado',
        'Restante',
        'Transacción'
      ].join(',');

      const rows = sales.map(sale => [
        sale._id,
        new Date(sale.createdAt).toISOString(),
        `"${sale.user?.name || ''} ${sale.user?.surname || ''}"`,
        sale.user?.email || '',
        sale.method_payment,
        sale.status,
        sale.total,
        sale.wallet_amount || 0,
        sale.remaining_amount || 0,
        sale.n_transaccion
      ].join(','));

      const csv = [headers, ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=sales_export_${Date.now()}.csv`);
      res.send(csv);

    } catch (error) {
      console.error('❌ [PaymentDashboard] Error al exportar:', error);
      res.status(500).send({
        message: 'Error al exportar ventas',
        error: error.message
      });
    }
  }

};

export default PaymentDashboardController;
