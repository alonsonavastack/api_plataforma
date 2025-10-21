import mongoose from 'mongoose';
import models from '../models/index.js';

// Destructurar modelos del index
const { Sale, SaleDetail, InstructorEarnings, PlatformCommissionSettings, Course, Project, User } = models;

// Las variables de entorno se cargan automáticamente con --env-file
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/plataforma_cursos';

async function fixEarnings() {
    try {
        console.log('🔄 Conectando a MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado a MongoDB\n');

        // Obtener configuración de comisiones
        let commissionSettings = await PlatformCommissionSettings.findOne();
        if (!commissionSettings) {
            console.log('⚠️  No se encontró configuración de comisiones, creando valores por defecto...');
            commissionSettings = await PlatformCommissionSettings.create({
                default_commission_rate: 20,
                days_until_available: 30,
                minimum_payment_threshold: 50,
                default_currency: 'USD',
                exchange_rate_usd_to_mxn: 17
            });
        }

        console.log('💰 Configuración de comisiones:');
        console.log(`   - Comisión por defecto: ${commissionSettings.default_commission_rate}%`);
        console.log(`   - Días hasta disponible: ${commissionSettings.days_until_available}`);
        console.log(`   - Umbral mínimo de pago: $${commissionSettings.minimum_payment_threshold}\n`);

        // Buscar todas las ventas pagadas
        const paidSales = await Sale.find({ status: 'Pagado' });
        console.log(`📊 Ventas pagadas encontradas: ${paidSales.length}\n`);

        if (paidSales.length === 0) {
            console.log('⚠️  No hay ventas pagadas. No se pueden crear ganancias.');
            await mongoose.disconnect();
            return;
        }

        let created = 0;
        let existing = 0;
        let errors = 0;

        for (const sale of paidSales) {
            console.log(`\n📦 Procesando venta: ${sale.n_transaccion}`);
            console.log(`   Total: $${sale.total} ${sale.currency_total}`);
            console.log(`   Fecha: ${sale.created_at || new Date()}`);

            // Obtener detalles de la venta
            const saleDetails = await SaleDetail.find({ sale: sale._id })
                .populate('product');

            console.log(`   📋 Detalles: ${saleDetails.length} items`);

            for (const detail of saleDetails) {
                try {
                    // Verificar si ya existe una ganancia para este detalle
                    const existingEarning = await InstructorEarnings.findOne({
                        sale: sale._id,
                        course: detail.product
                    });

                    if (existingEarning) {
                        console.log(`   ✓ Ya existe ganancia para course ID: ${detail.product}`);
                        existing++;
                        continue;
                    }

                    // Solo procesar cursos (no proyectos por ahora)
                    if (detail.product_type !== 'course') {
                        console.log(`   ⚠️  Saltando ${detail.product_type} (solo cursos por ahora)`);
                        continue;
                    }

                    // Obtener el curso con el instructor
                    const course = await Course.findById(detail.product).select('user title');
                    
                    if (!course || !course.user) {
                        console.log(`   ❌ No se pudo obtener el curso o instructor para ID: ${detail.product}`);
                        errors++;
                        continue;
                    }

                    // Calcular comisiones
                    const salePrice = detail.total;
                    const platformCommissionRate = commissionSettings.default_commission_rate;
                    const platformCommissionAmount = (salePrice * platformCommissionRate) / 100;
                    const instructorEarning = salePrice - platformCommissionAmount;

                    // Calcular fecha de disponibilidad
                    const earnedAt = sale.created_at || new Date();
                    const availableAt = new Date(earnedAt);
                    availableAt.setDate(availableAt.getDate() + commissionSettings.days_until_available);

                    // Crear ganancia con los campos correctos del modelo
                    const earning = await InstructorEarnings.create({
                        instructor: course.user,
                        sale: sale._id,
                        course: detail.product,
                        sale_price: salePrice,
                        currency: sale.currency_total || 'USD',
                        platform_commission_rate: platformCommissionRate,
                        platform_commission_amount: platformCommissionAmount,
                        instructor_earning: instructorEarning,
                        status: 'pending',
                        earned_at: earnedAt,
                        available_at: availableAt
                    });

                    console.log(`   ✅ Ganancia creada:`);
                    console.log(`      - Instructor: ${course.user}`);
                    console.log(`      - Curso: ${course.title || detail.product}`);
                    console.log(`      - Precio venta: $${salePrice}`);
                    console.log(`      - Comisión plataforma: $${platformCommissionAmount.toFixed(2)} (${platformCommissionRate}%)`);
                    console.log(`      - Ganancia instructor: $${instructorEarning.toFixed(2)}`);
                    console.log(`      - Estado: ${earning.status}`);
                    console.log(`      - Disponible el: ${availableAt.toLocaleDateString()}`);

                    created++;

                } catch (error) {
                    console.log(`   ❌ Error procesando detalle:`, error.message);
                    errors++;
                }
            }
        }

        console.log('\n============================================================');
        console.log('📊 RESUMEN DEL PROCESO');
        console.log('============================================================');
        console.log(`Total de ventas pagadas: ${paidSales.length}`);
        console.log(`Ganancias creadas: ${created}`);
        console.log(`Ganancias ya existentes: ${existing}`);
        console.log(`Errores: ${errors}`);
        console.log('============================================================\n');

        // Mostrar estadísticas
        const allEarnings = await InstructorEarnings.find()
            .populate('instructor', 'name email');

        if (allEarnings.length > 0) {
            console.log('📈 ESTADÍSTICAS DE GANANCIAS\n');
            
            console.log('Por estado:');
            const byStatus = await InstructorEarnings.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$instructor_earning' } } }
            ]);
            byStatus.forEach(s => {
                console.log(`   - ${s._id}: ${s.count} ($${s.total.toFixed(2)})`);
            });

            console.log('\nPor instructor:');
            const byInstructor = await InstructorEarnings.aggregate([
                { $group: { _id: '$instructor', count: { $sum: 1 }, total: { $sum: '$instructor_earning' } } },
                { $sort: { total: -1 } }
            ]);
            
            for (const inst of byInstructor) {
                const instructor = allEarnings.find(e => e.instructor._id.toString() === inst._id.toString())?.instructor;
                console.log(`   - ${instructor?.name || 'Desconocido'}: ${inst.count} ganancias ($${inst.total.toFixed(2)})`);
            }
        }

        console.log('\n✅ Proceso completado exitosamente');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
    }
}

fixEarnings();
