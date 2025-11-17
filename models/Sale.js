import mongoose, {Schema} from "mongoose";
import CourseStudent from './CourseStudent.js';
import SaleDetail from './SaleDetail.js';
import Course from './Course.js';
import Project from './Project.js';
import InstructorEarnings from './InstructorEarnings.js';
import PlatformCommissionSettings from './PlatformCommissionSettings.js';
import User from './User.js';
import FiscalService from '../service/fiscal.service.js';

const SaleSchema = new Schema({
    user: {type: Schema.ObjectId, ref: 'user',required:true},
    method_payment:{type:String,maxlength: 200,required:true},
    currency_total:{type:String,default:'USD'},
    currency_payment:{type:String,default:'USD'},
    status: { type: String, default: 'Pendiente' }, // 'Pendiente', 'Pagado', 'Anulado'
    total: { type: Number, required: true },
    detail: [{ // Este es un subdocumento, no una colección separada
        product: { type: Schema.ObjectId, required: true, refPath: 'detail.product_type' }, // Referencia dinámica
        product_type: { type: String, required: true, enum: ['course', 'project'] },
        title: { type: String },
        price_unit: { type: Number },
        discount: { type: Number, default: 0 },
        type_discount: { type: Number, default: 0 },
    }],    
    price_dolar:{type: Number, default: 3.66},
    n_transaccion:{type:String,maxlength: 200,required:true},
    // 🆕 Campos de billetera digital
    wallet_amount: {type: Number, default: 0},
    remaining_amount: {type: Number, default: 0}
},{
    timestamps: true
});

/**
 * Hook PRE-SAVE: Se ejecuta antes de guardar un documento 'Sale'.
 * Si el estado de la venta se está actualizando a 'Pagado':
 * 1. Crea las inscripciones a los cursos correspondientes
 * 2. Registra las ganancias del instructor con CÁLCULOS FISCALES
 */
SaleSchema.pre('save', async function (next) {
    // `isModified('status')` comprueba si el campo 'status' ha cambiado.
    // `this.status === 'Pagado'` comprueba que el nuevo valor sea 'Pagado'.
    if (this.isModified('status') && this.status === 'Pagado') {
      try {
        // Ahora los detalles están directamente en el documento de la venta
        const details = this.detail;
  
        // Iteramos sobre cada artículo en el detalle de la venta
        for (const item of details) {
          // PROCESAR CURSOS
          if (item.product_type === 'course') {
            // 1. CREAR INSCRIPCIÓN AL CURSO
            const existingEnrollment = await CourseStudent.findOne({
              user: this.user,
              course: item.product,
            });
  
            if (!existingEnrollment) {
              await CourseStudent.create({
                user: this.user,
                course: item.product,
              });
              console.log(`✓ Inscripción creada para el usuario ${this.user} en el curso ${item.product}`);
            }

            // 2. REGISTRAR GANANCIA DEL INSTRUCTOR DEL CURSO CON CÁLCULOS FISCALES
            const course = await Course.findById(item.product).populate('user');
            
            if (course && course.user) {
              const instructor = await User.findById(course.user._id);
              const commissionRate = await PlatformCommissionSettings.getInstructorCommissionRate(course.user._id);
              const settings = await PlatformCommissionSettings.getSettings();
              
              const salePrice = item.price_unit || 0;
              
              // ✅ CALCULAR PAGO CON FISCAL SERVICE
              try {
                const payoutCalculation = await FiscalService.calculateInstructorPayout({
                  saleAmountUSD: salePrice,
                  platformCommissionRate: commissionRate,
                  instructor: instructor
                });
                
                // Validar límites fiscales
                const validation = FiscalService.validateTaxLimits(
                  instructor,
                  payoutCalculation.tax.subtotalSinIVA || payoutCalculation.sale.amountTaxCurrency
                );
                
                // Calcular fechas
                const earnedAt = new Date();
                const availableAt = new Date(earnedAt);
                availableAt.setDate(availableAt.getDate() + settings.days_until_available);
                
                // Determinar estado
                let status = settings.days_until_available === 0 ? 'available' : 'pending';
                if (!validation.canContinue) {
                  status = 'blocked';
                }
                
                // Verificar si ya existe
                const existingEarning = await InstructorEarnings.findOne({
                  sale: this._id,
                  course: item.product
                });
                
                if (!existingEarning) {
                  await InstructorEarnings.create({
                    instructor: course.user._id,
                    sale: this._id,
                    course: item.product,
                    
                    // Montos base
                    sale_price: salePrice,
                    sale_price_includes_vat: true,
                    currency: this.currency_total || 'USD',
                    
                    // Comisión plataforma
                    platform_commission_rate: commissionRate,
                    platform_commission_amount: payoutCalculation.platform.commissionAmount,
                    
                    // Datos fiscales
                    fiscal: {
                      country: payoutCalculation.tax.country,
                      tax_regime: payoutCalculation.tax.regime,
                      tax_regime_name: payoutCalculation.tax.regimeName,
                      tax_currency: payoutCalculation.tax.currency,
                      
                      // Impuestos México
                      subtotal_sin_iva: payoutCalculation.tax.subtotalSinIVA || 0,
                      iva_amount: payoutCalculation.tax.iva || 0,
                      iva_rate: payoutCalculation.tax.ivaRate || 0,
                      retencion_iva: payoutCalculation.tax.retencionIVA || 0,
                      retencion_iva_rate: payoutCalculation.tax.retencionIVARate || 0,
                      isr_amount: payoutCalculation.tax.isrAmount || 0,
                      isr_rate: payoutCalculation.tax.isrRate || 0,
                      
                      // Impuestos otros países
                      retencion_irpf: payoutCalculation.tax.retencionIRPF || 0,
                      other_taxes: payoutCalculation.tax.totalTaxes || 0,
                      total_taxes: payoutCalculation.tax.totalTaxes || 0,
                      
                      // Ingreso acumulado
                      ingreso_acumulado_antes: payoutCalculation.tax.ingresoAcumuladoAntes || 0,
                      ingreso_acumulado_despues: payoutCalculation.tax.ingresoAcumuladoDespues || 0
                    },
                    
                    // Método de pago
                    payment_method: payoutCalculation.payment.method,
                    payment_method_name: payoutCalculation.payment.methodName,
                    payment_currency: payoutCalculation.payment.currency,
                    payment_fee_rate: payoutCalculation.payment.feeRate,
                    payment_fee_amount: payoutCalculation.payment.feeAmount,
                    
                    // Tipos de cambio
                    exchange_rates: {
                      usd_to_tax_currency: payoutCalculation.exchangeRates.USD_to_taxCurrency,
                      tax_currency_to_payment_currency: payoutCalculation.exchangeRates.taxCurrency_to_paymentCurrency,
                      timestamp: payoutCalculation.exchangeRates.timestamp
                    },
                    
                    // Ganancia final
                    instructor_earning: payoutCalculation.summary.totalInstructorReceives,
                    instructor_earning_usd: payoutCalculation.summary.totalInstructorReceivesUSD,
                    
                    // Estado y fechas
                    status: status,
                    earned_at: earnedAt,
                    available_at: availableAt,
                    
                    // Alertas fiscales
                    fiscal_alerts: validation.alerts.map(alert => ({
                      level: alert.level,
                      message: alert.message,
                      percentage: parseFloat(alert.percentage)
                    }))
                  });
                  
                  // Actualizar ingreso acumulado del instructor
                  if (payoutCalculation.tax.ingresoAcumuladoDespues) {
                    instructor.fiscal.ingresoAcumuladoAnual = payoutCalculation.tax.ingresoAcumuladoDespues;
                    instructor.fiscal.ultimaActualizacionIngresos = new Date();
                    await instructor.save();
                  }
                  
                  console.log(`✅ Ganancia registrada (CON FISCAL): ${course.user.name}`);
                  console.log(`   Venta: $${salePrice} USD → Ganancia: $${payoutCalculation.summary.totalInstructorReceives.toFixed(2)} ${payoutCalculation.payment.currency}`);
                  console.log(`   Impuestos: $${payoutCalculation.tax.totalTaxes?.toFixed(2) || 0} ${payoutCalculation.tax.currency}`);
                }
              } catch (fiscalError) {
                console.error('❌ Error en cálculo fiscal, usando método legacy:', fiscalError.message);
                
                // FALLBACK: Método anterior sin cálculos fiscales
                const platformCommissionAmount = (salePrice * commissionRate) / 100;
                const instructorEarning = salePrice - platformCommissionAmount;
                
                const earnedAt = new Date();
                const availableAt = new Date(earnedAt);
                availableAt.setDate(availableAt.getDate() + settings.days_until_available);
                const status = settings.days_until_available === 0 ? 'available' : 'pending';
                
                await InstructorEarnings.create({
                  instructor: course.user._id,
                  sale: this._id,
                  course: item.product,
                  sale_price: salePrice,
                  currency: this.currency_total || 'USD',
                  platform_commission_rate: commissionRate,
                  platform_commission_amount: platformCommissionAmount,
                  instructor_earning: instructorEarning,
                  status: status,
                  earned_at: earnedAt,
                  available_at: availableAt
                });
              }
            }
          }
          
          // PROCESAR PROYECTOS
          if (item.product_type === 'project') {
            const project = await Project.findById(item.product).populate('user');
            
            if (project && project.user) {
              const instructor = await User.findById(project.user._id);
              const commissionRate = await PlatformCommissionSettings.getInstructorCommissionRate(project.user._id);
              const settings = await PlatformCommissionSettings.getSettings();
              
              const salePrice = item.price_unit || 0;
              
              // ✅ CALCULAR PAGO CON FISCAL SERVICE
              try {
                const payoutCalculation = await FiscalService.calculateInstructorPayout({
                  saleAmountUSD: salePrice,
                  platformCommissionRate: commissionRate,
                  instructor: instructor
                });
                
                const validation = FiscalService.validateTaxLimits(
                  instructor,
                  payoutCalculation.tax.subtotalSinIVA || payoutCalculation.sale.amountTaxCurrency
                );
                
                const earnedAt = new Date();
                const availableAt = new Date(earnedAt);
                availableAt.setDate(availableAt.getDate() + settings.days_until_available);
                
                let statusProject = settings.days_until_available === 0 ? 'available' : 'pending';
                if (!validation.canContinue) {
                  statusProject = 'blocked';
                }
                
                const existingEarning = await InstructorEarnings.findOne({
                  sale: this._id,
                  product_id: item.product,
                  product_type: 'project'
                });
                
                if (!existingEarning) {
                  await InstructorEarnings.create({
                    instructor: project.user._id,
                    sale: this._id,
                    product_id: item.product,
                    product_type: 'project',
                    
                    sale_price: salePrice,
                    sale_price_includes_vat: true,
                    currency: this.currency_total || 'USD',
                    
                    platform_commission_rate: commissionRate,
                    platform_commission_amount: payoutCalculation.platform.commissionAmount,
                    
                    fiscal: {
                      country: payoutCalculation.tax.country,
                      tax_regime: payoutCalculation.tax.regime,
                      tax_regime_name: payoutCalculation.tax.regimeName,
                      tax_currency: payoutCalculation.tax.currency,
                      subtotal_sin_iva: payoutCalculation.tax.subtotalSinIVA || 0,
                      iva_amount: payoutCalculation.tax.iva || 0,
                      iva_rate: payoutCalculation.tax.ivaRate || 0,
                      retencion_iva: payoutCalculation.tax.retencionIVA || 0,
                      retencion_iva_rate: payoutCalculation.tax.retencionIVARate || 0,
                      isr_amount: payoutCalculation.tax.isrAmount || 0,
                      isr_rate: payoutCalculation.tax.isrRate || 0,
                      retencion_irpf: payoutCalculation.tax.retencionIRPF || 0,
                      other_taxes: payoutCalculation.tax.totalTaxes || 0,
                      total_taxes: payoutCalculation.tax.totalTaxes || 0,
                      ingreso_acumulado_antes: payoutCalculation.tax.ingresoAcumuladoAntes || 0,
                      ingreso_acumulado_despues: payoutCalculation.tax.ingresoAcumuladoDespues || 0
                    },
                    
                    payment_method: payoutCalculation.payment.method,
                    payment_method_name: payoutCalculation.payment.methodName,
                    payment_currency: payoutCalculation.payment.currency,
                    payment_fee_rate: payoutCalculation.payment.feeRate,
                    payment_fee_amount: payoutCalculation.payment.feeAmount,
                    
                    exchange_rates: {
                      usd_to_tax_currency: payoutCalculation.exchangeRates.USD_to_taxCurrency,
                      tax_currency_to_payment_currency: payoutCalculation.exchangeRates.taxCurrency_to_paymentCurrency,
                      timestamp: payoutCalculation.exchangeRates.timestamp
                    },
                    
                    instructor_earning: payoutCalculation.summary.totalInstructorReceives,
                    instructor_earning_usd: payoutCalculation.summary.totalInstructorReceivesUSD,
                    
                    status: statusProject,
                    earned_at: earnedAt,
                    available_at: availableAt,
                    
                    fiscal_alerts: validation.alerts.map(alert => ({
                      level: alert.level,
                      message: alert.message,
                      percentage: parseFloat(alert.percentage)
                    }))
                  });
                  
                  if (payoutCalculation.tax.ingresoAcumuladoDespues) {
                    instructor.fiscal.ingresoAcumuladoAnual = payoutCalculation.tax.ingresoAcumuladoDespues;
                    instructor.fiscal.ultimaActualizacionIngresos = new Date();
                    await instructor.save();
                  }
                  
                  console.log(`✅ Ganancia registrada (PROYECTO CON FISCAL): ${project.user.name}`);
                }
              } catch (fiscalError) {
                console.error('❌ Error en cálculo fiscal (proyecto):', fiscalError.message);
                // FALLBACK legacy
              }
            }
          }
        }
      } catch (error) {
        console.error('Error al crear inscripciones/ganancias desde el hook de venta:', error);
        return next(error);
      }
    }
    next();
  });

const Sale = mongoose.model("sale",SaleSchema);
export default Sale;
