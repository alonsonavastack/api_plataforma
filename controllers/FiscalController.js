/**
 * 🌍 FISCAL CONTROLLER
 * 
 * Controlador para gestión de configuración fiscal y dashboard de ganancias
 * 
 * @version 1.0.0
 * @date 27 de Octubre, 2025
 */

import User from '../models/User.js';
import InstructorEarnings from '../models/InstructorEarnings.js';
import FiscalService from '../service/fiscal.service.js';

// ====================================================================
// 📊 DASHBOARD DE GANANCIAS DEL INSTRUCTOR
// ====================================================================

/**
 * GET /api/fiscal/my-earnings
 * 
 * Obtiene las ganancias del instructor autenticado
 * Incluye: disponibles, pendientes, pagadas, bloqueadas
 */
export const getMyEarnings = async (req, res) => {
  try {
    const instructorId = req.user.sub;
    
    // Obtener todas las ganancias del instructor
    const earnings = await InstructorEarnings.find({ instructor: instructorId })
      .populate('course', 'title portada')
      .populate('product_id', 'title portada')
      .populate('sale', 'createdAt n_transaccion')
      .sort({ earned_at: -1 });
    
    // Agrupar por estado
    const summary = {
      pending: {
        count: 0,
        total_usd: 0,
        total_local: 0,
        currency: 'USD',
        items: []
      },
      available: {
        count: 0,
        total_usd: 0,
        total_local: 0,
        currency: 'USD',
        items: []
      },
      paid: {
        count: 0,
        total_usd: 0,
        total_local: 0,
        currency: 'USD',
        items: []
      },
      blocked: {
        count: 0,
        total_usd: 0,
        total_local: 0,
        currency: 'USD',
        items: []
      },
      total_earned_usd: 0,
      total_earned_local: 0,
      total_taxes: 0,
      total_platform_commission: 0
    };
    
    for (const earning of earnings) {
      const status = earning.status;
      const currency = earning.payment_currency || earning.currency;
      
      summary[status].count++;
      summary[status].total_usd += earning.instructor_earning_usd || 0;
      summary[status].total_local += earning.instructor_earning || 0;
      summary[status].currency = currency;
      summary[status].items.push(earning);
      
      summary.total_earned_usd += earning.instructor_earning_usd || 0;
      summary.total_earned_local += earning.instructor_earning || 0;
      summary.total_taxes += earning.fiscal?.total_taxes || 0;
      summary.total_platform_commission += earning.platform_commission_amount || 0;
    }
    
    res.status(200).send({
      success: true,
      summary,
      earnings
    });
  } catch (error) {
    console.error('❌ Error obteniendo ganancias:', error);
    res.status(500).send({
      success: false,
      message: 'Error al obtener ganancias del instructor'
    });
  }
};

// ====================================================================
// 📊 DASHBOARD ADMIN - TODAS LAS GANANCIAS
// ====================================================================

/**
 * GET /api/fiscal/all-earnings
 * 
 * Obtiene TODAS las ganancias de TODOS los instructores (solo admin)
 */
export const getAllEarnings = async (req, res) => {
  try {
    const { status, instructor, page = 1, limit = 20 } = req.query;
    
    // Construir filtros
    const filters = {};
    if (status) filters.status = status;
    if (instructor) filters.instructor = instructor;
    
    // Paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Obtener ganancias
    const earnings = await InstructorEarnings.find(filters)
      .populate('instructor', 'name surname email country fiscal')
      .populate('course', 'title portada')
      .populate('product_id', 'title portada')
      .populate('sale', 'createdAt n_transaccion')
      .sort({ earned_at: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalCount = await InstructorEarnings.countDocuments(filters);
    
    // Calcular totales generales
    const allEarnings = await InstructorEarnings.find(filters);
    
    const totals = {
      pending: { count: 0, total_usd: 0 },
      available: { count: 0, total_usd: 0 },
      paid: { count: 0, total_usd: 0 },
      blocked: { count: 0, total_usd: 0 },
      total_usd: 0,
      total_taxes: 0,
      total_platform_commission: 0
    };
    
    for (const earning of allEarnings) {
      totals[earning.status].count++;
      totals[earning.status].total_usd += earning.instructor_earning_usd || 0;
      totals.total_usd += earning.instructor_earning_usd || 0;
      totals.total_taxes += earning.fiscal?.total_taxes || 0;
      totals.total_platform_commission += earning.platform_commission_amount || 0;
    }
    
    res.status(200).send({
      success: true,
      earnings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit)
      },
      totals
    });
  } catch (error) {
    console.error('❌ Error obteniendo todas las ganancias:', error);
    res.status(500).send({
      success: false,
      message: 'Error al obtener todas las ganancias'
    });
  }
};

// ====================================================================
// ⚙️ CONFIGURACIÓN FISCAL DEL INSTRUCTOR
// ====================================================================

/**
 * GET /api/fiscal/my-config
 * 
 * Obtiene la configuración fiscal del instructor autenticado
 */
export const getMyFiscalConfig = async (req, res) => {
  try {
    const instructorId = req.user.sub;
    const instructor = await User.findById(instructorId);
    
    if (!instructor) {
      return res.status(404).send({
        success: false,
        message: 'Instructor no encontrado'
      });
    }
    
    // Obtener configuración del país
    const countryConfig = FiscalService.getCountryConfig(instructor.country);
    
    // Calcular progreso de límite anual (para RESICO)
    let limitProgress = null;
    const regimenFiscal = instructor.fiscal?.regimenFiscal;
    if (countryConfig && countryConfig.taxRegimes[regimenFiscal]) {
      const taxRegime = countryConfig.taxRegimes[regimenFiscal];
      if (taxRegime.annualLimit) {
        const ingresoAcumulado = instructor.fiscal?.ingresoAcumuladoAnual || 0;
        const percentage = (ingresoAcumulado / taxRegime.annualLimit) * 100;
        
        limitProgress = {
          current: ingresoAcumulado,
          limit: taxRegime.annualLimit,
          percentage: percentage.toFixed(2),
          currency: countryConfig.currency,
          status: percentage >= 100 ? 'exceeded' : percentage >= 90 ? 'danger' : percentage >= 80 ? 'warning' : 'safe'
        };
      }
    }
    
    res.status(200).send({
      success: true,
      fiscal: instructor.fiscal,
      country: instructor.country,
      paymentMethod: instructor.paymentMethod,
      countryConfig,
      limitProgress
    });
  } catch (error) {
    console.error('❌ Error obteniendo configuración fiscal:', error);
    res.status(500).send({
      success: false,
      message: 'Error al obtener configuración fiscal'
    });
  }
};

/**
 * PUT /api/fiscal/update-config
 * 
 * Actualiza la configuración fiscal del instructor
 */
export const updateFiscalConfig = async (req, res) => {
  try {
    const instructorId = req.user.sub;
    const {
      country,
      paymentMethod,
      regimenFiscal,
      rfc,
      razonSocial,
      domicilioFiscal,
      cuentaBancaria
    } = req.body;
    
    const instructor = await User.findById(instructorId);
    
    if (!instructor) {
      return res.status(404).send({
        success: false,
        message: 'Instructor no encontrado'
      });
    }
    
    // Validar país soportado
    if (country) {
      const countryConfig = FiscalService.getCountryConfig(country);
      if (!countryConfig) {
        return res.status(400).send({
          success: false,
          message: 'País no soportado'
        });
      }
      instructor.country = country;
    }
    
    // Validar método de pago
    if (paymentMethod) {
      const countryConfig = FiscalService.getCountryConfig(instructor.country);
      if (!countryConfig.paymentMethods.includes(paymentMethod)) {
        return res.status(400).send({
          success: false,
          message: 'Método de pago no soportado para este país'
        });
      }
      instructor.paymentMethod = paymentMethod;
    }
    
    // Actualizar datos fiscales
    if (!instructor.fiscal) {
      instructor.fiscal = {};
    }
    
    if (regimenFiscal !== undefined) instructor.fiscal.regimenFiscal = regimenFiscal;
    if (rfc !== undefined) instructor.fiscal.rfc = rfc;
    if (razonSocial !== undefined) instructor.fiscal.razonSocial = razonSocial;
    if (domicilioFiscal !== undefined) instructor.fiscal.domicilioFiscal = domicilioFiscal;
    
    // Actualizar cuenta bancaria
    if (cuentaBancaria) {
      if (!instructor.fiscal.cuentaBancaria) {
        instructor.fiscal.cuentaBancaria = {};
      }
      Object.assign(instructor.fiscal.cuentaBancaria, cuentaBancaria);
    }
    
    await instructor.save();
    
    res.status(200).send({
      success: true,
      message: 'Configuración fiscal actualizada',
      fiscal: instructor.fiscal,
      country: instructor.country,
      paymentMethod: instructor.paymentMethod
    });
  } catch (error) {
    console.error('❌ Error actualizando configuración fiscal:', error);
    res.status(500).send({
      success: false,
      message: 'Error al actualizar configuración fiscal'
    });
  }
};

// ====================================================================
// 🌍 INFORMACIÓN DE PAÍSES SOPORTADOS
// ====================================================================

/**
 * GET /api/fiscal/countries
 * 
 * Lista todos los países soportados con sus configuraciones
 */
export const getSupportedCountries = async (req, res) => {
  try {
    const countries = FiscalService.getSupportedCountries();
    
    res.status(200).send({
      success: true,
      countries
    });
  } catch (error) {
    console.error('❌ Error obteniendo países:', error);
    res.status(500).send({
      success: false,
      message: 'Error al obtener países soportados'
    });
  }
};

/**
 * GET /api/fiscal/country-config/:code
 * 
 * Obtiene la configuración completa de un país
 */
export const getCountryConfig = async (req, res) => {
  try {
    const { code } = req.params;
    const config = FiscalService.getCountryConfig(code);
    
    if (!config) {
      return res.status(404).send({
        success: false,
        message: 'País no encontrado'
      });
    }
    
    res.status(200).send({
      success: true,
      config
    });
  } catch (error) {
    console.error('❌ Error obteniendo configuración de país:', error);
    res.status(500).send({
      success: false,
      message: 'Error al obtener configuración del país'
    });
  }
};

// ====================================================================
// 💰 MARCAR GANANCIAS COMO PAGADAS (ADMIN)
// ====================================================================

/**
 * PUT /api/fiscal/mark-as-paid
 * 
 * Marca una ganancia como pagada (solo admin)
 */
export const markAsPaid = async (req, res) => {
  try {
    const { earningId, paymentReference, adminNotes } = req.body;
    
    const earning = await InstructorEarnings.findById(earningId);
    
    if (!earning) {
      return res.status(404).send({
        success: false,
        message: 'Ganancia no encontrada'
      });
    }
    
    if (earning.status !== 'available') {
      return res.status(400).send({
        success: false,
        message: 'La ganancia debe estar en estado "available" para ser pagada'
      });
    }
    
    earning.status = 'paid';
    earning.paid_at = new Date();
    if (paymentReference) earning.payment_reference = paymentReference;
    if (adminNotes) earning.admin_notes = adminNotes;
    
    await earning.save();
    
    res.status(200).send({
      success: true,
      message: 'Ganancia marcada como pagada',
      earning
    });
  } catch (error) {
    console.error('❌ Error marcando como pagado:', error);
    res.status(500).send({
      success: false,
      message: 'Error al marcar ganancia como pagada'
    });
  }
};

export default {
  getMyEarnings,
  getAllEarnings,
  getMyFiscalConfig,
  updateFiscalConfig,
  getSupportedCountries,
  getCountryConfig,
  markAsPaid
};
