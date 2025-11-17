import mongoose from 'mongoose';
import models from './models/index.js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

/**
 * 💰 Crear registros de ganancias para el instructor cuando se completa una venta
 * @param {Object} sale - Venta completa con todos los detalles
 */
async function createInstructorEarnings(sale) {
    try {
        console.log(`💰 Creando ganancias para venta ${sale._id}...`);

        // Obtener configuración de comisiones
        const commissionSettings = await models.PlatformCommissionSettings.findOne();
        const defaultCommissionRate = commissionSettings?.default_commission_rate || 30;
        const daysUntilAvailable = commissionSettings?.days_until_available || 0;

        console.log(`📊 Configuración: Comisión ${defaultCommissionRate}%, Días: ${daysUntilAvailable}`);

        // Calcular fecha de disponibilidad
        const availableAt = new Date();
        availableAt.setDate(availableAt.getDate() + daysUntilAvailable);

        // Procesar cada producto de la venta
        for (const item of sale.detail) {
            let instructorId = null;

            console.log(`📦 Procesando item: ${item.product_type} - ${item.product}`);

            // Obtener el instructor según el tipo de producto
            if (item.product_type === 'course') {
                const course = await models.Course.findById(item.product).select('user');
                if (course && course.user) {
                    instructorId = course.user;
                    console.log(`👨‍🏫 Instructor del curso: ${instructorId}`);
                }
            } else if (item.product_type === 'project') {
                const project = await models.Project.findById(item.product).select('user');
                if (project && project.user) {
                    instructorId = project.user;
                    console.log(`👨‍🏫 Instructor del proyecto: ${instructorId}`);
                }
            }

            // Si no hay instructor, skip
            if (!instructorId) {
                console.log(`⚠️  Producto ${item.product} no tiene instructor asignado, SKIP`);
                continue;
            }

            // Verificar si el instructor tiene comisión personalizada
            let commissionRate = defaultCommissionRate;
            const customRate = commissionSettings?.instructor_custom_rates?.find(
                rate => rate.instructor.toString() === instructorId.toString()
            );
            if (customRate) {
                commissionRate = customRate.commission_rate;
                console.log(`✨ Comisión personalizada para instructor: ${commissionRate}%`);
            }

            // Calcular montos
            const salePrice = item.price_unit;
            const platformCommissionAmount = (salePrice * commissionRate) / 100;
            const instructorEarning = salePrice - platformCommissionAmount;

            console.log(`💵 Cálculos:`);
            console.log(`   - Precio venta: $${salePrice}`);
            console.log(`   - Comisión plataforma (${commissionRate}%): $${platformCommissionAmount.toFixed(2)}`);
            console.log(`   - Ganancia instructor: $${instructorEarning.toFixed(2)}`);

            // Crear registro de ganancia
            const earningData = {
                instructor: instructorId,
                sale: sale._id,
                product_id: item.product,
                product_type: item.product_type,
                
                // Montos
                sale_price: salePrice,
                currency: sale.currency_total || 'USD',
                platform_commission_rate: commissionRate,
                platform_commission_amount: platformCommissionAmount,
                instructor_earning: instructorEarning,
                instructor_earning_usd: instructorEarning,
                
                // Estado y fechas
                status: daysUntilAvailable === 0 ? 'available' : 'pending',
                earned_at: new Date(),
                available_at: availableAt,
            };

            // Guardar en base de datos
            const savedEarning = await models.InstructorEarnings.create(earningData);
            console.log(`✅ Ganancia creada con ID: ${savedEarning._id}`);
            console.log(`   Estado: ${savedEarning.status}`);
        }

        console.log(`✅ Todas las ganancias fueron creadas para la venta ${sale._id}\n`);
    } catch (error) {
        console.error(`❌ Error al crear ganancias para venta ${sale._id}:`, error);
    }
}

/**
 * Script principal
 */
async function main() {
    try {
        console.log('🔧 Iniciando procesamiento de ventas existentes...\n');

        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Conectado a MongoDB\n');

        // Buscar todas las ventas pagadas
        const sales = await models.Sale.find({ status: 'Pagado' });
        console.log(`📊 Encontradas ${sales.length} ventas con estado "Pagado"\n`);

        if (sales.length === 0) {
            console.log('⚠️  No hay ventas para procesar');
            process.exit(0);
        }

        let processedCount = 0;
        let skippedCount = 0;

        for (const sale of sales) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📝 Procesando venta: ${sale._id}`);
            console.log(`   - Fecha: ${sale.createdAt}`);
            console.log(`   - Total: $${sale.total} ${sale.currency_total || 'USD'}`);
            console.log(`   - Productos: ${sale.detail.length}`);

            // Verificar si ya existen ganancias para esta venta
            const existingEarnings = await models.InstructorEarnings.findOne({ sale: sale._id });
            
            if (existingEarnings) {
                console.log(`⏩ Ya tiene ganancias creadas, SKIP`);
                skippedCount++;
                continue;
            }

            // Crear ganancias para esta venta
            await createInstructorEarnings(sale);
            processedCount++;
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`\n✅ PROCESO COMPLETADO:`);
        console.log(`   - Ventas procesadas: ${processedCount}`);
        console.log(`   - Ventas omitidas: ${skippedCount}`);
        console.log(`   - Total ventas: ${sales.length}\n`);

        // Verificar ganancias creadas
        const totalEarnings = await models.InstructorEarnings.countDocuments();
        console.log(`📊 Total de registros de ganancias en BD: ${totalEarnings}\n`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    }
}

// Ejecutar script
main();
