import models from '../models/index.js';

/**
 * 🏦 COMMISSION REPORT CONTROLLER
 * Reportes de comisiones de la plataforma (para el dueño)
 */
const CommissionReportController = {
    
    /**
     * 💰 REPORTE GENERAL DE COMISIONES
     * Muestra cuánto ha ganado la plataforma (dueño)
     * 
     * Query params:
     * - start_date: Fecha inicio (YYYY-MM-DD)
     * - end_date: Fecha fin (YYYY-MM-DD)
     * - period: 'day' | 'week' | 'month' | 'year'
     * - instructor_id: Filtrar por instructor específico
     */
    getCommissionsSummary: async (req, res) => {
        try {
            const { start_date, end_date, period = 'month', instructor_id } = req.query;
            
            // Construir filtro de fecha
            let dateFilter = {};
            if (start_date && end_date) {
                dateFilter = {
                    createdAt: {
                        $gte: new Date(start_date),
                        $lte: new Date(end_date)
                    }
                };
            } else if (period) {
                // Calcular rango según período
                const now = new Date();
                let startDate = new Date();
                
                switch(period) {
                    case 'day':
                        startDate.setHours(0, 0, 0, 0);
                        break;
                    case 'week':
                        startDate.setDate(now.getDate() - 7);
                        break;
                    case 'month':
                        startDate.setMonth(now.getMonth() - 1);
                        break;
                    case 'year':
                        startDate.setFullYear(now.getFullYear() - 1);
                        break;
                }
                
                dateFilter = { createdAt: { $gte: startDate, $lte: now } };
            }
            
            // Filtro de estado (solo ventas pagadas)
            const filter = {
                ...dateFilter,
                status: 'Pagado'
            };
            
            // Si se especifica instructor
            if (instructor_id) {
                // Buscar earnings de ese instructor
                const earnings = await models.InstructorEarnings.find({ 
                    instructor: instructor_id,
                    ...dateFilter 
                });
                
                const saleIds = earnings.map(e => e.sale);
                filter._id = { $in: saleIds };
            }
            
            // Obtener todas las ventas del período
            const sales = await models.Sale.find(filter)
                .populate('user', 'name surname email')
                .populate('detail.product')
                .sort({ createdAt: -1 });
            
            // Obtener earnings correspondientes
            const saleIds = sales.map(s => s._id);
            const earnings = await models.InstructorEarnings.find({ 
                sale: { $in: saleIds } 
            })
            .populate('instructor', 'name surname email')
            .populate('course', 'title')
            .populate({
                path: 'product_id',
                select: 'title'
            });
            
            // CÁLCULOS PRINCIPALES
            let totalVentasBruto = 0;           // Total vendido (100%)
            let totalComisionesPlatforma = 0;   // Comisiones para el dueño (30%)
            let totalPagoInstructores = 0;      // Pago a instructores (70%)
            let totalImpuestos = 0;             // Total de impuestos
            let totalVentas = sales.length;
            
            // Desglose fiscal
            let totalIVA = 0;
            let totalRetencionIVA = 0;
            let totalISR = 0;
            let totalOtrosImpuestos = 0;
            
            // Por estado
            let comisionesDisponibles = 0;
            let comisionesPendientes = 0;
            let comisionesPagadas = 0;
            
            // Procesar cada earning
            earnings.forEach(earning => {
                // Sumar comisiones de la plataforma
                totalComisionesPlatforma += earning.platform_commission_amount || 0;
                
                // Sumar pagos a instructores
                totalPagoInstructores += earning.instructor_earning || 0;
                
                // Sumar impuestos
                if (earning.fiscal) {
                    totalIVA += earning.fiscal.iva_amount || 0;
                    totalRetencionIVA += earning.fiscal.retencion_iva || 0;
                    totalISR += earning.fiscal.isr_amount || 0;
                    totalOtrosImpuestos += earning.fiscal.other_taxes || 0;
                    totalImpuestos += earning.fiscal.total_taxes || 0;
                }
                
                // Por estado
                switch(earning.status) {
                    case 'available':
                        comisionesDisponibles += earning.platform_commission_amount || 0;
                        break;
                    case 'pending':
                        comisionesPendientes += earning.platform_commission_amount || 0;
                        break;
                    case 'paid':
                        comisionesPagadas += earning.platform_commission_amount || 0;
                        break;
                }
            });
            
            // Calcular total bruto de ventas
            sales.forEach(sale => {
                totalVentasBruto += sale.total || 0;
            });
            
            // Calcular neto (comisiones - impuestos)
            const netoPlataforma = totalComisionesPlatforma - totalImpuestos;
            
            // RESPUESTA
            res.status(200).json({
                success: true,
                period: period || 'custom',
                date_range: {
                    start: start_date || dateFilter.createdAt?.$gte,
                    end: end_date || dateFilter.createdAt?.$lte
                },
                summary: {
                    // INGRESOS BRUTOS (100% de ventas)
                    total_ventas_bruto: parseFloat(totalVentasBruto.toFixed(2)),
                    total_ventas_count: totalVentas,
                    
                    // COMISIONES PLATAFORMA (TUS GANANCIAS)
                    total_comisiones_plataforma: parseFloat(totalComisionesPlatforma.toFixed(2)),
                    porcentaje_comision: '30%', // O dinámico si varía
                    
                    // PAGOS A INSTRUCTORES
                    total_pago_instructores: parseFloat(totalPagoInstructores.toFixed(2)),
                    porcentaje_instructores: '70%',
                    
                    // IMPUESTOS
                    total_impuestos: parseFloat(totalImpuestos.toFixed(2)),
                    
                    // NETO (COMISIONES - IMPUESTOS)
                    neto_plataforma: parseFloat(netoPlataforma.toFixed(2)),
                    
                    // POR ESTADO
                    comisiones_disponibles: parseFloat(comisionesDisponibles.toFixed(2)),
                    comisiones_pendientes: parseFloat(comisionesPendientes.toFixed(2)),
                    comisiones_pagadas: parseFloat(comisionesPagadas.toFixed(2))
                },
                fiscal: {
                    iva: parseFloat(totalIVA.toFixed(2)),
                    retencion_iva: parseFloat(totalRetencionIVA.toFixed(2)),
                    isr: parseFloat(totalISR.toFixed(2)),
                    otros_impuestos: parseFloat(totalOtrosImpuestos.toFixed(2)),
                    total: parseFloat(totalImpuestos.toFixed(2))
                },
                sales_count: totalVentas,
                earnings_count: earnings.length
            });
            
        } catch (error) {
            console.error('❌ Error en getCommissionsSummary:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener resumen de comisiones',
                error: error.message
            });
        }
    },
    
    /**
     * 📊 COMISIONES POR PERÍODO (GRÁFICA)
     * Agrupa comisiones por día/semana/mes/año
     */
    getCommissionsByPeriod: async (req, res) => {
        try {
            const { period = 'month', start_date, end_date } = req.query;
            
            // Construir filtro de fecha
            let dateFilter = {};
            if (start_date && end_date) {
                dateFilter = {
                    createdAt: {
                        $gte: new Date(start_date),
                        $lte: new Date(end_date)
                    }
                };
            } else {
                // Últimos 6 meses por defecto
                const now = new Date();
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(now.getMonth() - 6);
                dateFilter = { createdAt: { $gte: sixMonthsAgo, $lte: now } };
            }
            
            // Determinar formato de agrupación
            let groupFormat;
            switch(period) {
                case 'day':
                    groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
                    break;
                case 'week':
                    groupFormat = { 
                        $dateToString: { 
                            format: "Semana %U - %Y", 
                            date: "$createdAt" 
                        } 
                    };
                    break;
                case 'month':
                    groupFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
                    break;
                case 'year':
                    groupFormat = { $dateToString: { format: "%Y", date: "$createdAt" } };
                    break;
                default:
                    groupFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
            }
            
            // Agregación en Sales
            const salesByPeriod = await models.Sale.aggregate([
                {
                    $match: {
                        ...dateFilter,
                        status: 'Pagado'
                    }
                },
                {
                    $group: {
                        _id: groupFormat,
                        total_ventas_bruto: { $sum: '$total' },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]);
            
            // Obtener earnings del mismo período
            const earnings = await models.InstructorEarnings.find(dateFilter);
            
            // Agrupar earnings por período
            const earningsByPeriod = {};
            earnings.forEach(earning => {
                let periodKey;
                const date = new Date(earning.createdAt);
                
                switch(period) {
                    case 'day':
                        periodKey = date.toISOString().split('T')[0];
                        break;
                    case 'month':
                        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                        break;
                    case 'year':
                        periodKey = `${date.getFullYear()}`;
                        break;
                    default:
                        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                }
                
                if (!earningsByPeriod[periodKey]) {
                    earningsByPeriod[periodKey] = {
                        comisiones_plataforma: 0,
                        pago_instructores: 0,
                        impuestos: 0
                    };
                }
                
                earningsByPeriod[periodKey].comisiones_plataforma += earning.platform_commission_amount || 0;
                earningsByPeriod[periodKey].pago_instructores += earning.instructor_earning || 0;
                earningsByPeriod[periodKey].impuestos += earning.fiscal?.total_taxes || 0;
            });
            
            // Combinar datos
            const data = salesByPeriod.map(item => {
                const periodData = earningsByPeriod[item._id] || {
                    comisiones_plataforma: 0,
                    pago_instructores: 0,
                    impuestos: 0
                };
                
                return {
                    period: item._id,
                    total_ventas_bruto: parseFloat(item.total_ventas_bruto.toFixed(2)),
                    ventas_count: item.count,
                    comisiones_plataforma: parseFloat(periodData.comisiones_plataforma.toFixed(2)),
                    pago_instructores: parseFloat(periodData.pago_instructores.toFixed(2)),
                    impuestos: parseFloat(periodData.impuestos.toFixed(2)),
                    neto_plataforma: parseFloat((periodData.comisiones_plataforma - periodData.impuestos).toFixed(2))
                };
            });
            
            res.status(200).json({
                success: true,
                period: period,
                data: data
            });
            
        } catch (error) {
            console.error('❌ Error en getCommissionsByPeriod:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener comisiones por período',
                error: error.message
            });
        }
    },
    
    /**
     * 👨‍🏫 COMISIONES POR INSTRUCTOR
     * Cuánto ha generado cada instructor en comisiones para la plataforma
     */
    getCommissionsByInstructor: async (req, res) => {
        try {
            const { start_date, end_date } = req.query;
            
            // Construir filtro de fecha
            let dateFilter = {};
            if (start_date && end_date) {
                dateFilter = {
                    createdAt: {
                        $gte: new Date(start_date),
                        $lte: new Date(end_date)
                    }
                };
            }
            
            // Agregación en earnings
            const commissionsByInstructor = await models.InstructorEarnings.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: '$instructor',
                        total_comisiones_plataforma: { $sum: '$platform_commission_amount' },
                        total_pago_instructor: { $sum: '$instructor_earning' },
                        total_ventas_bruto: { $sum: '$sale_price' },
                        total_impuestos: { $sum: '$fiscal.total_taxes' },
                        ventas_count: { $sum: 1 },
                        
                        // Por estado
                        disponibles: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'available'] }, '$platform_commission_amount', 0]
                            }
                        },
                        pendientes: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'pending'] }, '$platform_commission_amount', 0]
                            }
                        },
                        pagadas: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'paid'] }, '$platform_commission_amount', 0]
                            }
                        }
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'instructor'
                    }
                },
                { $unwind: '$instructor' },
                {
                    $project: {
                        instructor_id: '$_id',
                        instructor_name: { $concat: ['$instructor.name', ' ', '$instructor.surname'] },
                        instructor_email: '$instructor.email',
                        total_comisiones_plataforma: { $round: ['$total_comisiones_plataforma', 2] },
                        total_pago_instructor: { $round: ['$total_pago_instructor', 2] },
                        total_ventas_bruto: { $round: ['$total_ventas_bruto', 2] },
                        total_impuestos: { $round: ['$total_impuestos', 2] },
                        neto_plataforma: { 
                            $round: [
                                { $subtract: ['$total_comisiones_plataforma', '$total_impuestos'] }, 
                                2
                            ] 
                        },
                        ventas_count: 1,
                        disponibles: { $round: ['$disponibles', 2] },
                        pendientes: { $round: ['$pendientes', 2] },
                        pagadas: { $round: ['$pagadas', 2] }
                    }
                },
                { $sort: { total_comisiones_plataforma: -1 } }
            ]);
            
            res.status(200).json({
                success: true,
                instructors: commissionsByInstructor
            });
            
        } catch (error) {
            console.error('❌ Error en getCommissionsByInstructor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener comisiones por instructor',
                error: error.message
            });
        }
    },
    
    /**
     * 📚 COMISIONES POR PRODUCTO (CURSO/PROYECTO)
     * Qué productos generan más comisiones
     */
    getCommissionsByProduct: async (req, res) => {
        try {
            const { start_date, end_date, product_type } = req.query;
            
            // Construir filtro
            let filter = {};
            if (start_date && end_date) {
                filter.createdAt = {
                    $gte: new Date(start_date),
                    $lte: new Date(end_date)
                };
            }
            
            if (product_type) {
                filter.$or = [
                    { course: { $exists: true } },
                    { product_type: product_type }
                ];
            }
            
            // Obtener earnings con productos
            const earnings = await models.InstructorEarnings.find(filter)
                .populate('course', 'title')
                .populate('product_id', 'title');
            
            // Agrupar por producto
            const productMap = {};
            
            earnings.forEach(earning => {
                let productId, productTitle, productType;
                
                if (earning.course) {
                    productId = earning.course._id;
                    productTitle = earning.course.title;
                    productType = 'course';
                } else if (earning.product_id) {
                    productId = earning.product_id._id;
                    productTitle = earning.product_id.title;
                    productType = earning.product_type || 'project';
                } else {
                    return; // Skip si no tiene producto
                }
                
                if (!productMap[productId]) {
                    productMap[productId] = {
                        product_id: productId,
                        product_title: productTitle,
                        product_type: productType,
                        total_comisiones_plataforma: 0,
                        total_pago_instructor: 0,
                        total_ventas_bruto: 0,
                        total_impuestos: 0,
                        ventas_count: 0
                    };
                }
                
                productMap[productId].total_comisiones_plataforma += earning.platform_commission_amount || 0;
                productMap[productId].total_pago_instructor += earning.instructor_earning || 0;
                productMap[productId].total_ventas_bruto += earning.sale_price || 0;
                productMap[productId].total_impuestos += earning.fiscal?.total_taxes || 0;
                productMap[productId].ventas_count += 1;
            });
            
            // Convertir a array y ordenar
            const products = Object.values(productMap)
                .map(p => ({
                    ...p,
                    total_comisiones_plataforma: parseFloat(p.total_comisiones_plataforma.toFixed(2)),
                    total_pago_instructor: parseFloat(p.total_pago_instructor.toFixed(2)),
                    total_ventas_bruto: parseFloat(p.total_ventas_bruto.toFixed(2)),
                    total_impuestos: parseFloat(p.total_impuestos.toFixed(2)),
                    neto_plataforma: parseFloat((p.total_comisiones_plataforma - p.total_impuestos).toFixed(2))
                }))
                .sort((a, b) => b.total_comisiones_plataforma - a.total_comisiones_plataforma);
            
            res.status(200).json({
                success: true,
                products: products
            });
            
        } catch (error) {
            console.error('❌ Error en getCommissionsByProduct:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener comisiones por producto',
                error: error.message
            });
        }
    }
};

export default CommissionReportController;
