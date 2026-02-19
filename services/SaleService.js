import models from "../models/index.js";
import TaxBreakdownService from "./TaxBreakdownService.js";
import { calculatePaymentSplit } from "../utils/commissionCalculator.js";

/**
 * 📚 Inscribir estudiante en un curso
 */
async function enrollStudent(userId, courseId) {
    try {
        const existing = await models.CourseStudent.findOne({ user: userId, course: courseId });
        if (!existing) {
            await models.CourseStudent.create({ user: userId, course: courseId });
            console.log(`   ✅ Inscripción en curso creada: usuario ${userId} en curso ${courseId}`);
        } else {
            console.log(`   ℹ️  Usuario ya inscrito en curso ${courseId}`);
        }
    } catch (error) {
        console.error(`   ❌ Error al inscribir estudiante en curso:`, error.message);
    }
}

/**
 * 💰 Crear ganancia para el instructor
 * 🔥 ACTUALIZADO: Ahora incluye información de descuentos
 */
async function createEarningForProduct(sale, item) {
    try {
        let instructorId;
        let salePrice = item.price_unit; // 🔥 Este YA es el precio final (con descuento aplicado)

        // 🔥 CORRECCIÓN CRÍTICA: CALCULAR PRECIO ORIGINAL Y DESCUENTO
        let originalPrice = salePrice;
        let discountAmount = item.discount || 0;
        let discountType = item.type_discount || 0;
        let discountPercentage = 0;
        let actualDiscountAmount = 0;

        if (discountAmount > 0 && discountType > 0) {
            if (discountType === 1) {
                // Porcentaje: price_unit YA tiene el descuento aplicado
                // Necesitamos calcular el precio original
                discountPercentage = discountAmount;
                originalPrice = salePrice / (1 - discountAmount / 100);
                actualDiscountAmount = originalPrice - salePrice;
            } else if (discountType === 2) {
                // Monto fijo: el descuento es directo
                originalPrice = salePrice + discountAmount;
                actualDiscountAmount = discountAmount;
                discountPercentage = (discountAmount / originalPrice) * 100;
            }
        }

        console.log(`   💰 Precio de venta: ${salePrice.toFixed(2)}`);
        if (discountPercentage > 0) {
            console.log(`   🎁 Precio original: ${originalPrice.toFixed(2)}`);
            console.log(`   🎁 Descuento aplicado: ${discountPercentage.toFixed(1)}% (-${actualDiscountAmount.toFixed(2)})`);
        }

        // 1. Identificar instructor
        // 🔥 FIX: Validar ambos campos (product_type o type_detail)
        const type = item.product_type || item.type_detail;

        if (type === 'course') {
            const course = await models.Course.findById(item.product).populate('user');
            if (!course || !course.user) return false;
            instructorId = course.user._id;
        } else if (type === 'project') {
            const project = await models.Project.findById(item.product).populate('user');
            if (!project || !project.user) return false;
            instructorId = project.user._id;
        } else {
            console.warn(`   ⚠️ Item sin tipo válido: ${type} (Product ID: ${item.product})`);
            return false;
        }

        // ✅ PREVENCIÓN DE DUPLICADOS: Verificar si ya existe ganancia
        const existingEarning = await models.InstructorEarnings.findOne({
            sale: sale._id,
            product_id: item.product
        });

        if (existingEarning) {
            console.log(`   ⚠️ Ganancia ya existe para producto ${item.product}. Saltando...`);
            return false;
        }

        // 2. 🔥 Obtener configuración de comisiones desde la base de datos
        const settings = await models.PlatformCommissionSettings.findOne();

        // 🔥 COMISIÓN: Determinar si es Referido u Orgánico
        let commissionRatePercent = settings?.default_commission_rate || 30; // Default 30% (70% instructor)
        let isReferral = false;

        // Si la venta tiene marca de referido Y el cupón es válido para este instructor/producto
        if (sale.is_referral && sale.coupon_code) {
            // Validar que el cupón realmente pertenezca a este instructor (seguridad adicional)
            const coupon = await models.Coupon.findOne({ code: sale.coupon_code });

            if (coupon && coupon.instructor.toString() === instructorId.toString()) {
                // Si es referido: 80% instructor, 20% plataforma
                commissionRatePercent = settings?.referral_commission_rate || 20;
                isReferral = true;
            }
        }

        const commissionRate = commissionRatePercent / 100;
        // 🔥 FIX: Permitir 0 días (no usar || porque 0 es falsy)
        const daysUntilAvailable = settings?.days_until_available !== undefined ? settings.days_until_available : 7;

        console.log(`   🏛 Comisión plataforma: ${commissionRatePercent}%`);
        console.log(`   ⏳ Días hasta disponible: ${daysUntilAvailable} días`);

        // 3. 🔥 CÁLCULO SOBRE NETO (NUEVO REQUERIMIENTO - PROGRESSIVE ROUNDING)
        // Usamos la utilidad centralizada para asegurar que todo cuadre al centavo
        const splitResult = calculatePaymentSplit(salePrice);

        const paypalFee = splitResult.paypalFee;
        const netSale = splitResult.netAmount;

        // El splitResult ya nos da vendorShare (70%) y platformShare (30%) por defecto
        // Pero aquí necesitamos aplicar el % específico del instructor (que puede ser 80/20 si es referido)

        let platformCommission = 0;
        let instructorEarning = 0;

        if (netSale > 0) {
            // Recalculamos usando el Neto OFICIAL devuelto por la utilidad
            platformCommission = parseFloat((netSale * commissionRate).toFixed(2));
            instructorEarning = parseFloat((netSale - platformCommission).toFixed(2));
        }

        console.log(`   💸 PayPal Fee (Est.): -${paypalFee.toFixed(2)}`);
        console.log(`   🥩 Base Repartible (Neto): ${netSale.toFixed(2)}`);

        // Calcular fecha disponible
        const availableAt = new Date();
        availableAt.setDate(availableAt.getDate() + daysUntilAvailable);

        // 🔥 CORRECCIÓN: Respetar días de disponibilidad
        const earningStatus = daysUntilAvailable > 0 ? 'pending' : 'available';

        // 4. 🔥 Crear ganancia CON información de descuento completa
        const newEarning = await models.InstructorEarnings.create({
            instructor: instructorId,
            sale: sale._id,
            product_id: item.product,
            product_type: item.product_type,
            sale_price: salePrice, // Precio CON descuento (precio final pagado por usuario)
            currency: sale.currency_total || sale.currency_payment || 'MXN',

            // 🔥 Guardamos comisiones de pasarela
            payment_fee_rate: 0, // Ya no es un % fijo simple
            payment_fee_amount: paypalFee,

            platform_commission_rate: commissionRate,
            platform_commission_amount: platformCommission,
            instructor_earning: instructorEarning,
            instructor_earning_usd: instructorEarning, // Asumimos misma moneda por ahora o conversión simple
            is_referral: isReferral, // 🔥 Guardar si fue referido
            // 🔥 CORRECCIÓN: Guardar información correcta de descuento
            discount_info: {
                original_price: originalPrice,              // Precio antes del descuento
                discount_amount: actualDiscountAmount,      // Monto real descontado
                discount_type: discountType,                // 1=porcentaje, 2=monto fijo
                discount_percentage: discountPercentage,    // % equivalente
                campaign_discount: item.campaign_discount || null
            },
            status: earningStatus, // 🔥 SIEMPRE 'available'
            earned_at: new Date(),
            available_at: availableAt // 🔥 Fecha de referencia (historial), pero ya disponible
        });

        console.log(`   ✅ Ganancia creada para instructor ${instructorId}:`);
        console.log(`      💵 Precio venta: ${salePrice.toFixed(2)}`);
        console.log(`      🏛 Comisión plataforma (${(commissionRate * 100).toFixed(0)}%): ${platformCommission.toFixed(2)}`);
        console.log(`      💰 Ganancia instructor: ${instructorEarning.toFixed(2)}`);
        console.log(`      ✅ Estado: ${earningStatus} (disponible inmediatamente)`);
        if (discountPercentage > 0) {
            console.log(`      🎁 Descuento original: ${discountPercentage.toFixed(1)}% (-${actualDiscountAmount.toFixed(2)})`);
        }

        // 5. 🧮 NUEVO: Calcular Desglose Fiscal y Retenciones
        // 🔥 Esto genera los registros de auditoría y control fiscal
        await TaxBreakdownService.calculateBreakdown(sale, newEarning);

        return true;
    } catch (error) {
        console.error(`   ❌ Error al crear ganancia:`, error.message);
        throw error; // Re-lanzar para que el llamador lo maneje
    }
}

/**
 * 🎯 Procesar venta pagada - Inscripciones y ganancias
 * 🔥 IMPORTANTE: Los proyectos NO requieren inscripción - el acceso se verifica por venta pagada
 */
export async function processPaidSale(sale, userId) {
    console.log(`\n🎯 [processPaidSale] Procesando venta ${sale._id}...`);
    console.log(`   👤 Usuario: ${userId}`);
    console.log(`   📦 Total items: ${sale.detail ? sale.detail.length : (sale.sale_details ? sale.sale_details.length : 0)}`);

    // Compatibilidad con ambos formatos (detail vs sale_details)
    const items = sale.detail || sale.sale_details || [];

    for (const item of items) {
        console.log(`\n   ─────────────────────────────────`);
        console.log(`   📦 Item: ${item.title || 'Producto'}`);
        console.log(`   🏷️  Tipo: ${item.product_type || item.type_detail}`);
        console.log(`   🆔 Product ID: ${item.product || item.course || item.project}`);
        console.log(`   💰 Precio: ${item.price_unit}`);

        const type = item.product_type || item.type_detail;
        const productId = item.product || item.course || item.project;

        // 📚 Inscribir en CURSOS (tiene modelo CourseStudent)
        if (type === 'course') {
            console.log(`   📚 Inscribiendo en curso...`);
            await enrollStudent(userId, productId);
        }
        // 📦 PROYECTOS: No requieren inscripción (se verifica por venta pagada)
        else if (type === 'project') {
            console.log(`   📦 Proyecto: acceso otorgado automáticamente (sin modelo de inscripción)`);
            console.log(`   ✅ Acceso verificado mediante: Sale.status='Pagado' + detail.product_type='project'`);
        }

        // 💰 Crear ganancias del instructor (para cursos Y proyectos)
        console.log(`   💰 Creando ganancia para instructor...`);
        // ✅ CORRECCIÓN: Pasar item completo con toda la información de descuento
        const earningItem = {
            product: productId,
            product_type: type,
            title: item.title,
            price_unit: item.price_unit,
            discount: item.discount || 0,
            type_discount: item.type_discount || 0,
            campaign_discount: item.campaign_discount || null
        };
        await createEarningForProduct(sale, earningItem);
    }

    console.log(`\n✅ [processPaidSale] Venta ${sale._id} procesada completamente`);
    console.log(`✅ Acceso activado para ${items.length} producto(s)\n`);
}

export { createEarningForProduct };

export default {
    processPaidSale,
    createEarningForProduct
};
