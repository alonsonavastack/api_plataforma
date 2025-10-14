import mongoose, {Schema} from "mongoose";
import CourseStudent from './CourseStudent.js';
import SaleDetail from './SaleDetail.js';
import Course from './Course.js';
import InstructorEarnings from './InstructorEarnings.js';
import PlatformCommissionSettings from './PlatformCommissionSettings.js';

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
    n_transaccion:{type:String,maxlength: 200,required:true}
},{
    timestamps: true
});

/**
 * Hook PRE-SAVE: Se ejecuta antes de guardar un documento 'Sale'.
 * Si el estado de la venta se está actualizando a 'Pagado':
 * 1. Crea las inscripciones a los cursos correspondientes
 * 2. Registra las ganancias del instructor (InstructorEarnings)
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
          if (item.product_type === 'course') {
            // 1. CREAR INSCRIPCIÓN AL CURSO
            // Verificamos si ya existe una inscripción para evitar duplicados
            const existingEnrollment = await CourseStudent.findOne({
              user: this.user,
              course: item.product,
            });
  
            if (!existingEnrollment) {
              // Si no existe, creamos la nueva inscripción
              await CourseStudent.create({
                user: this.user,
                course: item.product,
              });
              console.log(`✓ Inscripción creada para el usuario ${this.user} en el curso ${item.product}`);
            }

            // 2. REGISTRAR GANANCIA DEL INSTRUCTOR
            // Obtener información del curso y su instructor
            const course = await Course.findById(item.product);
            
            if (course && course.user) {
              // Obtener la comisión configurada para este instructor
              const commissionRate = await PlatformCommissionSettings.getInstructorCommissionRate(course.user);
              
              // Obtener configuración global para días hasta disponible
              const settings = await PlatformCommissionSettings.getSettings();
              
              // Calcular montos
              const salePrice = item.price_unit || 0;
              const platformCommissionAmount = (salePrice * commissionRate) / 100;
              const instructorEarning = salePrice - platformCommissionAmount;
              
              // Calcular fecha disponible (fecha actual + días configurados)
              const earnedAt = new Date();
              const availableAt = new Date(earnedAt);
              availableAt.setDate(availableAt.getDate() + settings.days_until_available);
              
              // Verificar si ya existe un registro de ganancia para esta venta y curso
              const existingEarning = await InstructorEarnings.findOne({
                sale: this._id,
                course: item.product
              });
              
              if (!existingEarning) {
                // Crear registro de ganancia
                await InstructorEarnings.create({
                  instructor: course.user,
                  sale: this._id,
                  course: item.product,
                  sale_price: salePrice,
                  currency: this.currency_total || 'USD',
                  platform_commission_rate: commissionRate,
                  platform_commission_amount: platformCommissionAmount,
                  instructor_earning: instructorEarning,
                  status: 'pending',
                  earned_at: earnedAt,
                  available_at: availableAt
                });
                
                console.log(`✓ Ganancia registrada para instructor ${course.user} - Curso: ${course.title}`);
                console.log(`  Precio venta: $${salePrice}, Comisión: ${commissionRate}%, Ganancia: $${instructorEarning}`);
              }
            }
          }
          // Los proyectos no necesitan inscripción especial
          // Se acceden directamente desde las ventas pagadas
        }
      } catch (error) {
        console.error('Error al crear inscripciones/ganancias desde el hook de venta:', error);
        // Pasamos el error a next() para detener el proceso de guardado si algo falla
        return next(error);
      }
    }
    // Si no se modifica el estado o no es 'Pagado', continuamos sin hacer nada.
    next();
  });

const Sale = mongoose.model("sale",SaleSchema);
export default Sale;
