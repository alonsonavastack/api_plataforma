#!/usr/bin/env node
/**
 * Script de prueba rápida - Verifica si el sistema está funcionando
 */

import mongoose from "mongoose";
import InstructorEarnings from "../models/InstructorEarnings.js";
import PlatformCommissionSettings from "../models/PlatformCommissionSettings.js";

const quickTest = async () => {
  const MONGO_URI = process.env.MONGO_URI;

  try {
    await mongoose.connect(MONGO_URI);

    console.log("\n🔍 PRUEBA RÁPIDA DEL SISTEMA\n");
    console.log("=".repeat(50));

    // 1. Configuración
    const settings = await PlatformCommissionSettings.getSettings();
    const daysConfig =
      settings.days_until_available === 0
        ? "✅ 0 días (INMEDIATO)"
        : `⚠️ ${settings.days_until_available} días`;
    console.log(`\n1️⃣  Días hasta disponibilidad: ${daysConfig}`);

    // 2. Earnings disponibles
    const available = await InstructorEarnings.find({ status: "available" });
    const totalAvailable = available.reduce(
      (sum, e) => sum + e.instructor_earning,
      0
    );

    console.log(
      `2️⃣  Earnings disponibles: ${available.length} ($${totalAvailable.toFixed(
        2
      )})`
    );

    // 3. Earnings por tipo
    const courses = available.filter((e) => e.course);
    const projects = available.filter((e) => e.product_type === "project");

    console.log(
      `3️⃣  Por cursos: ${courses.length} | Por proyectos: ${projects.length}`
    );

    // 4. Instructores únicos
    const instructors = [
      ...new Set(available.map((e) => e.instructor.toString())),
    ];
    console.log(`4️⃣  Instructores con ganancias: ${instructors.length}`);

    // Resultado
    console.log("\n" + "=".repeat(50));
    if (available.length > 0 && settings.days_until_available === 0) {
      console.log("✅ SISTEMA FUNCIONANDO CORRECTAMENTE");
      console.log(
        `\n💰 ${
          instructors.length
        } instructor(es) con $${totalAvailable.toFixed(
          2
        )} disponibles para pago\n`
      );
    } else if (available.length === 0) {
      console.log("⚠️  NO HAY EARNINGS DISPONIBLES");
      console.log("\n💡 Ejecuta: node scripts/fix-missing-earnings.js\n");
    } else if (settings.days_until_available > 0) {
      console.log("⚠️  CONFIGURACIÓN NO ÓPTIMA");
      console.log(`\n💡 Cambia "Días para Disponibilidad" a 0 en Comisiones\n`);
    }
    console.log("=".repeat(50) + "\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await mongoose.connection.close();
  }
};

quickTest();
