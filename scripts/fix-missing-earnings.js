/**
 * Script para arreglar earnings faltantes
 * Este script:
 * 1. Busca todas las ventas con estado "Pagado"
 * 2. Verifica si tienen earnings creadas
 * 3. Crea las earnings faltantes para cursos Y proyectos
 */

import mongoose from "mongoose";
import Sale from "../models/Sale.js";
import Course from "../models/Course.js";
import Project from "../models/Project.js";
import InstructorEarnings from "../models/InstructorEarnings.js";
import PlatformCommissionSettings from "../models/PlatformCommissionSettings.js";

// Conectar a MongoDB
const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI;

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado a MongoDB");
  } catch (error) {
    console.error("❌ Error al conectar a MongoDB:", error);
    process.exit(1);
  }
};

const fixMissingEarnings = async () => {
  try {
    console.log("\n🔍 Buscando ventas pagadas...\n");

    // Buscar todas las ventas con estado "Pagado"
    const paidSales = await Sale.find({ status: "Pagado" }).lean();

    console.log(`📊 Total de ventas pagadas: ${paidSales.length}\n`);

    let earningsCreated = 0;
    let earningsAlreadyExist = 0;
    let errors = 0;

    // Obtener configuración global
    const settings = await PlatformCommissionSettings.getSettings();

    for (const sale of paidSales) {
      console.log(`\n📦 Procesando venta: ${sale.n_transaccion || sale._id}`);

      for (const item of sale.detail) {
        try {
          // PROCESAR CURSOS
          if (item.product_type === "course") {
            // Verificar si ya existe earning para este curso
            const existingEarning = await InstructorEarnings.findOne({
              sale: sale._id,
              course: item.product,
            });

            if (existingEarning) {
              console.log(`  ✓ Ya existe earning para curso ${item.title}`);
              earningsAlreadyExist++;
              continue;
            }

            // Obtener información del curso
            const course = await Course.findById(item.product);

            if (!course) {
              console.log(`  ⚠️  Curso no encontrado: ${item.product}`);
              errors++;
              continue;
            }

            if (!course.user) {
              console.log(`  ⚠️  Curso sin instructor: ${course.title}`);
              errors++;
              continue;
            }

            // Obtener comisión del instructor
            const commissionRate =
              await PlatformCommissionSettings.getInstructorCommissionRate(
                course.user
              );

            // Calcular montos
            const salePrice = item.price_unit || 0;
            const platformCommissionAmount = (salePrice * commissionRate) / 100;
            const instructorEarning = salePrice - platformCommissionAmount;

            // Calcular fechas
            const earnedAt = sale.createdAt || new Date();
            const availableAt = new Date(earnedAt);
            availableAt.setDate(
              availableAt.getDate() + settings.days_until_available
            );

            // Determinar estado: si days es 0 O si la fecha ya pasó, es 'available'
            let status = "pending";
            if (
              settings.days_until_available === 0 ||
              new Date() >= availableAt
            ) {
              status = "available";
            }

            // Crear earning
            await InstructorEarnings.create({
              instructor: course.user,
              sale: sale._id,
              course: item.product,
              sale_price: salePrice,
              currency: sale.currency_total || "USD",
              platform_commission_rate: commissionRate,
              platform_commission_amount: platformCommissionAmount,
              instructor_earning: instructorEarning,
              status: status,
              earned_at: earnedAt,
              available_at: availableAt,
            });

            console.log(`  ✅ Earning creada para curso: ${course.title}`);
            console.log(`     Instructor: ${course.user}`);
            console.log(
              `     Precio: $${salePrice} | Comisión: ${commissionRate}% | Ganancia: $${instructorEarning.toFixed(
                2
              )}`
            );
            console.log(
              `     Estado: ${status} | Disponible: ${availableAt.toLocaleDateString()}`
            );
            earningsCreated++;
          }

          // PROCESAR PROYECTOS
          if (item.product_type === "project") {
            // Verificar si ya existe earning para este proyecto
            const existingEarning = await InstructorEarnings.findOne({
              sale: sale._id,
              product_id: item.product,
              product_type: "project",
            });

            if (existingEarning) {
              console.log(`  ✓ Ya existe earning para proyecto ${item.title}`);
              earningsAlreadyExist++;
              continue;
            }

            // Obtener información del proyecto
            const project = await Project.findById(item.product);

            if (!project) {
              console.log(`  ⚠️  Proyecto no encontrado: ${item.product}`);
              errors++;
              continue;
            }

            if (!project.user) {
              console.log(`  ⚠️  Proyecto sin instructor: ${project.title}`);
              errors++;
              continue;
            }

            // Obtener comisión del instructor
            const commissionRate =
              await PlatformCommissionSettings.getInstructorCommissionRate(
                project.user
              );

            // Calcular montos
            const salePrice = item.price_unit || 0;
            const platformCommissionAmount = (salePrice * commissionRate) / 100;
            const instructorEarning = salePrice - platformCommissionAmount;

            // Calcular fechas
            const earnedAt = sale.createdAt || new Date();
            const availableAt = new Date(earnedAt);
            availableAt.setDate(
              availableAt.getDate() + settings.days_until_available
            );

            // Determinar estado: si days es 0 O si la fecha ya pasó, es 'available'
            let status = "pending";
            if (
              settings.days_until_available === 0 ||
              new Date() >= availableAt
            ) {
              status = "available";
            }

            // Crear earning
            await InstructorEarnings.create({
              instructor: project.user,
              sale: sale._id,
              product_id: item.product,
              product_type: "project",
              sale_price: salePrice,
              currency: sale.currency_total || "USD",
              platform_commission_rate: commissionRate,
              platform_commission_amount: platformCommissionAmount,
              instructor_earning: instructorEarning,
              status: status,
              earned_at: earnedAt,
              available_at: availableAt,
            });

            console.log(`  ✅ Earning creada para proyecto: ${project.title}`);
            console.log(`     Instructor: ${project.user}`);
            console.log(
              `     Precio: $${salePrice} | Comisión: ${commissionRate}% | Ganancia: $${instructorEarning.toFixed(
                2
              )}`
            );
            console.log(
              `     Estado: ${status} | Disponible: ${availableAt.toLocaleDateString()}`
            );
            earningsCreated++;
          }
        } catch (itemError) {
          console.error(`  ❌ Error al procesar item:`, itemError.message);
          errors++;
        }
      }
    }

    console.log("\n\n========================================");
    console.log("📊 RESUMEN DE LA OPERACIÓN");
    console.log("========================================");
    console.log(`✅ Earnings creadas:        ${earningsCreated}`);
    console.log(`ℹ️  Earnings ya existentes:  ${earningsAlreadyExist}`);
    console.log(`❌ Errores:                 ${errors}`);
    console.log("========================================\n");
  } catch (error) {
    console.error("❌ Error general:", error);
  } finally {
    await mongoose.connection.close();
    console.log("👋 Conexión cerrada");
  }
};

// Ejecutar script
(async () => {
  await connectDB();
  await fixMissingEarnings();
})();
