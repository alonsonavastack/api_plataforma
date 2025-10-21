#!/usr/bin/env node
/**
 * Script de diagnóstico del sistema de pagos a instructores
 * Muestra el estado actual de ventas, earnings y configuración
 */

import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import InstructorEarnings from '../models/InstructorEarnings.js';
import PlatformCommissionSettings from '../models/PlatformCommissionSettings.js';
import User from '../models/User.js';

const connectDB = async () => {
    const MONGO_URI = process.env.MONGO_URI;
    try {
        console.log('🔄 Conectando a MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado a MongoDB\n');
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        process.exit(1);
    }
};

const runDiagnostic = async () => {
    try {
        console.log('='.repeat(70));
        console.log('  DIAGNÓSTICO DEL SISTEMA DE PAGOS A INSTRUCTORES');
        console.log('='.repeat(70) + '\n');

        // 1. CONFIGURACIÓN
        console.log('📋 1. CONFIGURACIÓN DE COMISIONES\n');
        const settings = await PlatformCommissionSettings.getSettings();
        console.log(`   Comisión por defecto:        ${settings.default_commission_rate}%`);
        console.log(`   Días hasta disponibilidad:   ${settings.days_until_available} días`);
        console.log(`   Umbral mínimo de pago:       $${settings.minimum_payment_threshold} USD`);
        console.log(`   Tasa de cambio USD→MXN:      ${settings.exchange_rate_usd_to_mxn}\n`);

        // 2. VENTAS
        console.log('💰 2. ESTADO DE VENTAS\n');
        const salesStats = await Sale.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    total: { $sum: '$total' }
                }
            }
        ]);

        salesStats.forEach(stat => {
            console.log(`   ${stat._id.padEnd(15)} | ${String(stat.count).padStart(3)} ventas | $${stat.total.toFixed(2)}`);
        });
        console.log('');

        // 3. EARNINGS
        console.log('💵 3. ESTADO DE EARNINGS\n');
        const earningsStats = await InstructorEarnings.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    total: { $sum: '$instructor_earning' }
                }
            }
        ]);

        earningsStats.forEach(stat => {
            console.log(`   ${stat._id.toUpperCase().padEnd(15)} | ${String(stat.count).padStart(3)} earnings | $${stat.total.toFixed(2)}`);
        });
        console.log('');

        // 4. EARNINGS POR TIPO
        console.log('📦 4. EARNINGS POR TIPO DE PRODUCTO\n');
        const earningsByType = await InstructorEarnings.aggregate([
            {
                $facet: {
                    courses: [
                        { $match: { course: { $exists: true } } },
                        {
                            $group: {
                                _id: 'courses',
                                count: { $sum: 1 },
                                total: { $sum: '$instructor_earning' }
                            }
                        }
                    ],
                    projects: [
                        { $match: { product_type: 'project' } },
                        {
                            $group: {
                                _id: 'projects',
                                count: { $sum: 1 },
                                total: { $sum: '$instructor_earning' }
                            }
                        }
                    ]
                }
            }
        ]);

        const courseData = earningsByType[0].courses[0] || { count: 0, total: 0 };
        const projectData = earningsByType[0].projects[0] || { count: 0, total: 0 };

        console.log(`   Cursos          | ${String(courseData.count).padStart(3)} earnings | $${courseData.total.toFixed(2)}`);
        console.log(`   Proyectos       | ${String(projectData.count).padStart(3)} earnings | $${projectData.total.toFixed(2)}`);
        console.log('');

        // 5. EARNINGS DISPONIBLES POR INSTRUCTOR
        console.log('👥 5. EARNINGS DISPONIBLES POR INSTRUCTOR\n');
        const availableByInstructor = await InstructorEarnings.aggregate([
            {
                $match: { status: 'available' }
            },
            {
                $group: {
                    _id: '$instructor',
                    totalEarnings: { $sum: '$instructor_earning' },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { totalEarnings: -1 }
            }
        ]);

        if (availableByInstructor.length === 0) {
            console.log('   ⚠️  No hay earnings disponibles para pago.\n');
        } else {
            for (const item of availableByInstructor) {
                const instructor = await User.findById(item._id).select('name email');
                console.log(`   ${(instructor?.name || 'N/A').padEnd(30)} | ${String(item.count).padStart(2)} earnings | $${item.totalEarnings.toFixed(2)}`);
            }
            console.log('');
        }

        // 6. VENTAS PAGADAS SIN EARNINGS
        console.log('🔍 6. VERIFICACIÓN DE INTEGRIDAD\n');
        const paidSales = await Sale.find({ status: 'Pagado' }).select('_id detail');
        let salesWithoutEarnings = 0;
        let itemsWithoutEarnings = [];

        for (const sale of paidSales) {
            for (const item of sale.detail) {
                let earning;
                if (item.product_type === 'course') {
                    earning = await InstructorEarnings.findOne({
                        sale: sale._id,
                        course: item.product
                    });
                } else if (item.product_type === 'project') {
                    earning = await InstructorEarnings.findOne({
                        sale: sale._id,
                        product_id: item.product,
                        product_type: 'project'
                    });
                }

                if (!earning) {
                    salesWithoutEarnings++;
                    itemsWithoutEarnings.push({
                        saleId: sale._id,
                        productType: item.product_type,
                        productId: item.product,
                        title: item.title
                    });
                }
            }
        }

        if (salesWithoutEarnings === 0) {
            console.log('   ✅ Todas las ventas pagadas tienen earnings registradas.\n');
        } else {
            console.log(`   ⚠️  ${salesWithoutEarnings} items de ventas pagadas SIN earnings:\n`);
            itemsWithoutEarnings.slice(0, 5).forEach((item, i) => {
                console.log(`   ${i + 1}. ${item.productType.toUpperCase()} | ${item.title || 'Sin título'}`);
                console.log(`      Sale: ${item.saleId} | Product: ${item.productId}\n`);
            });
            if (itemsWithoutEarnings.length > 5) {
                console.log(`   ... y ${itemsWithoutEarnings.length - 5} más.\n`);
            }
            console.log(`   💡 Ejecuta: node scripts/fix-missing-earnings.js\n`);
        }

        // 7. RESUMEN FINAL
        console.log('='.repeat(70));
        console.log('  RESUMEN');
        console.log('='.repeat(70) + '\n');

        const totalAvailable = availableByInstructor.reduce((sum, i) => sum + i.totalEarnings, 0);
        const totalInstructors = availableByInstructor.length;

        console.log(`   💰 Total disponible para pago:     $${totalAvailable.toFixed(2)} USD`);
        console.log(`   👥 Instructores con ganancias:     ${totalInstructors}`);
        console.log(`   📊 Promedio por instructor:        $${totalInstructors > 0 ? (totalAvailable / totalInstructors).toFixed(2) : '0.00'} USD`);
        console.log(`   ⚠️  Items sin earnings:             ${salesWithoutEarnings}`);
        console.log('');

        if (settings.days_until_available === 0) {
            console.log('   ✅ Configuración óptima: Earnings disponibles inmediatamente (0 días)');
        } else {
            console.log(`   ℹ️  Las earnings están disponibles después de ${settings.days_until_available} días`);
        }
        console.log('');

    } catch (error) {
        console.error('❌ Error en diagnóstico:', error);
    } finally {
        await mongoose.connection.close();
        console.log('='.repeat(70));
        console.log('👋 Diagnóstico completado - Conexión cerrada');
        console.log('='.repeat(70) + '\n');
    }
};

// Ejecutar
(async () => {
    await connectDB();
    await runDiagnostic();
})();
