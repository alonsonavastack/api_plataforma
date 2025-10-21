#!/usr/bin/env node
/**
 * Script para actualizar manualmente earnings pendientes a disponibles
 * Útil para testing sin esperar al CRON de medianoche
 */

import mongoose from "mongoose";
import InstructorEarnings from "../models/InstructorEarnings.js";
import User from "../models/User.js"; // 🔥 SOLUCIÓN: Importar el modelo User

const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI;

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado a MongoDB");
  } catch (error) {
    console.error("❌ Error al conectar a MongoDB:", error);
    process.exit(1);
  }
};

const updatePendingEarnings = async () => {
  try {
    const now = new Date();

    console.log("\n🔍 Buscando earnings pendientes...\n");

    // Buscar earnings pendientes cuya fecha available_at ya pasó
    const earningsToUpdate = await InstructorEarnings.find({
      status: "pending",
      available_at: { $lte: now },
    }).populate("instructor", "name email");

    if (earningsToUpdate.length === 0) {
      console.log("ℹ️  No hay earnings pendientes para actualizar.\n");
      return;
    }

    console.log(
      `📊 Encontradas ${earningsToUpdate.length} earnings para actualizar:\n`
    );

    // Mostrar detalles
    earningsToUpdate.forEach((earning, index) => {
      console.log(
        `${index + 1}. Instructor: ${earning.instructor?.name || "N/A"}`
      );
      console.log(`   Ganancia: $${earning.instructor_earning.toFixed(2)}`);
      console.log(`   Fecha ganada: ${earning.earned_at.toLocaleDateString()}`);
      console.log(
        `   Disponible desde: ${earning.available_at.toLocaleDateString()}`
      );
      console.log("");
    });

    // Actualizar
    const result = await InstructorEarnings.updateMany(
      {
        status: "pending",
        available_at: { $lte: now },
      },
      {
        $set: { status: "available" },
      }
    );

    console.log(
      `✅ Se actualizaron ${result.modifiedCount} earnings a estado 'available'.\n`
    );

    // Verificar totales
    const stats = await InstructorEarnings.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total: { $sum: "$instructor_earning" },
        },
      },
    ]);

    console.log("📊 ESTADÍSTICAS GENERALES:");
    console.log("─".repeat(50));
    stats.forEach((stat) => {
      console.log(
        `${stat._id.toUpperCase().padEnd(15)} | ${
          stat.count
        } earnings | $${stat.total.toFixed(2)}`
      );
    });
    console.log("─".repeat(50) + "\n");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("👋 Conexión cerrada\n");
  }
};

// Ejecutar
(async () => {
  console.log("\n" + "=".repeat(50));
  console.log("  ACTUALIZAR EARNINGS PENDIENTES → DISPONIBLES");
  console.log("=".repeat(50) + "\n");

  await connectDB();
  await updatePendingEarnings();
})();
