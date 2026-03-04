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

        // 🔒 NORMALIZAR product: si viene populado (objeto con _id), extraer solo el _id
        // Esto ocurre cuando la venta fue cargada con .populate('detail.product')
        if (item.product && typeof item.product === 'object' && item.product._id) {
            item = { ...item, product: item.product._id };
        }

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

        // Tasas base con fallback seguros (sin usar || para evitar que 0 sea falsy)
        const DEFAULT_COMMISSION = settings?.default_commission_rate ?? 30; // 30% plat → 70% instructor
        const REFERRAL_COMMISSION = 20; // 20% plat → 80% instructor (fija)

        let commissionRatePercent = DEFAULT_COMMISSION;
        let isReferral = false;

        // 🔥 COMISIÓN REFERIDO: verificar si la venta viene de un cupón válido
        if (sale.is_referral && sale.coupon_code) {
            console.log(`   🎟️ [REFERIDO] Verificando cupón: "${sale.coupon_code}"`);

            // Buscar el cupón SIN filtrar active/expires_at porque la venta ya ocurrió
            const coupon = await models.Coupon.findOne({
                code: sale.coupon_code.trim().toUpperCase()
            });

            if (!coupon) {
                console.warn(`   ⚠️ [REFERIDO] Cupón "${sale.coupon_code}" no encontrado en BD → comisión normal`);
            } else {
                const instructorMatch = coupon.instructor.toString() === instructorId.toString();
                const productMatch = coupon.projects.some(p => p.toString() === item.product.toString());

                console.log(`   🔍 [REFERIDO] instructor match: ${instructorMatch} | product match: ${productMatch}`);

                if (instructorMatch && productMatch) {
                    // ✅ Cupón verificado: 80% instructor, 20% plataforma
                    commissionRatePercent = REFERRAL_COMMISSION;
                    isReferral = true;
                    console.log(`   ✅ [REFERIDO] Comisión 80/20 aplicada (plataforma ${REFERRAL_COMMISSION}%)`);
                } else if (!instructorMatch) {
                    console.warn(`   ⚠️ [REFERIDO] El cupón pertenece a otro instructor → comisión normal`);
                } else {
                    console.warn(`   ⚠️ [REFERIDO] El producto no está en el cupón → comisión normal`);
                }
            }
        } else if (sale.is_referral && !sale.coupon_code) {
            // Marcada como referido pero sin código → aplicar 80/20 de todas formas
            console.log(`   🎟️ [REFERIDO] Venta marcada referido sin código → comisión 80/20`);
            commissionRatePercent = REFERRAL_COMMISSION;
            isReferral = true;
        }

        const commissionRate = commissionRatePercent / 100;

        // ─── VENTANA DE ESPERA PARA PAGOS ──────────────────────────────
        // 'days_until_available' es el tiempo total que el admin configura
        // para esperar antes de que la ganancia esté disponible.
        // Si es 0, estará disponible de inmediato.
        const totalDaysUntilAvailable = settings?.days_until_available !== undefined ? settings.days_until_available : 7;

        console.log(`   🏛 Comisión plataforma: ${commissionRatePercent}%`);
        console.log(`   📅 Total días hasta disponible: ${totalDaysUntilAvailable} días`);

        // 3. 🔥 CÁLCULO SOBRE NETO
        // Determinar gateway: solo Stripe o Wallet (PayPal eliminado)
        const isStripe = sale.method_payment === 'stripe' || sale.method_payment === 'mixed_stripe';
        const isWallet = sale.method_payment === 'wallet';

        let splitResult;

        if (isWallet) {
            // Wallet: sin fee de pasarela externa
            splitResult = {
                totalPaid: parseFloat(salePrice.toFixed(2)),
                paypalFee: 0,
                stripeFee: 0,
                netAmount: parseFloat(salePrice.toFixed(2)),
                currency: sale.currency_payment || 'MXN'
            };
        } else {
            // Stripe (predeterminado para cualquier otro método)
            splitResult = calculatePaymentSplit(salePrice, 'stripe');
        }

        const gatewayFee = splitResult.paypalFee; // paypalFee se usa genéricamente para cualquier gateway
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

        console.log(`   💸 Fee pasarela (Stripe): -${gatewayFee.toFixed(2)}`);
        console.log(`   🔗 Referido: ${isReferral ? 'Sí (80/20)' : 'No (70/30)'}`);
        console.log(`   🥩 Base Repartible (Neto): ${netSale.toFixed(2)}`);

        // Calcular fecha disponible
        const availableAt = new Date();
        availableAt.setDate(availableAt.getDate() + totalDaysUntilAvailable);

        // Si los días de espera son 0, la ganancia está disponible inmediatamente.
        // Si no, nace como 'pending' y el cron job la pasará a 'available' cuando corresponda.
        const earningStatus = totalDaysUntilAvailable === 0 ? 'available' : 'pending';

        // 4. 🔥 Crear ganancia CON información de descuento completa
        const newEarning = await models.InstructorEarnings.create({
            instructor: instructorId,
            sale: sale._id,
            product_id: item.product,
            product_type: item.product_type,
            sale_price: salePrice, // Precio CON descuento (precio final pagado por usuario)
            currency: sale.currency_total || sale.currency_payment || 'MXN',
            payment_method: sale.method_payment || 'wallet', // 🔥 GUARDAR EL MÉTODO UTILIZADO EN LA GANANCIA

            // 🔥 Guardamos comisiones de pasarela
            payment_fee_rate: 0,
            payment_fee_amount: gatewayFee,

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
        console.log(`      ⏳ Estado: ${earningStatus} | disponible en: ${availableAt.toLocaleDateString('es-MX')} (${totalDaysUntilAvailable} días)`);
        if (discountPercentage > 0) {
            console.log(`      🎁 Descuento original: ${discountPercentage.toFixed(1)}% (-${actualDiscountAmount.toFixed(2)})`);
        }

        // 5. 🧮 NUEVO: Calcular Desglose Fiscal y Retenciones
        // 🔥 Esto genera los registros de auditoría y control fiscal
        await TaxBreakdownService.calculateBreakdown(sale, newEarning);

        return true;
    } catch (error) {
        console.error(`   ❌ Error al crear ganancia:`, error.message);
        return false; // No relanzar — la venta ya fue procesada correctamente
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
        // 🔒 Extraer productId puro: si viene populado (objeto), usar su _id
        const rawProductRef = item.product || item.course || item.project;
        const productId = (rawProductRef && typeof rawProductRef === 'object' && rawProductRef._id)
            ? rawProductRef._id
            : rawProductRef;

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
        // ✅ CORRECCIÓN: Pasar item completo con toda la información de descuento.
        // IMPORTANTE: productId ya extrae el _id puro (string/ObjectId), nunca el objeto populado.
        const earningItem = {
            product: productId,   // ← siempre ObjectId puro, no objeto populado
            product_type: type,
            title: item.title,
            price_unit: item.price_unit,
            discount: item.discount || 0,
            type_discount: item.type_discount || 0,
            campaign_discount: item.campaign_discount || null
        };
        // Pasamos también la venta con is_referral y coupon_code seguros
        const saleForEarning = {
            ...sale,
            _id: sale._id,
            is_referral: sale.is_referral,
            coupon_code: sale.coupon_code || null,
            method_payment: sale.method_payment,
            currency_total: sale.currency_total,
            currency_payment: sale.currency_payment
        };
        await createEarningForProduct(saleForEarning, earningItem);
    }

    console.log(`\n✅ [processPaidSale] Venta ${sale._id} procesada completamente`);
    console.log(`✅ Acceso activado para ${items.length} producto(s)\n`);
}

export { createEarningForProduct };

export default {
    processPaidSale,
    createEarningForProduct
};
