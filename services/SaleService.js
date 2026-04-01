import models from "../models/index.js";
import TaxBreakdownService from "./TaxBreakdownService.js";
import { calculatePaymentSplit } from "../utils/commissionCalculator.js";
import { sendPurchaseConfirmation } from "../helpers/email.js";
import { notifyAdminNewSale, notifyPaymentApproved } from "./telegram.service.js";

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
                discountPercentage = discountAmount;
                originalPrice = salePrice / (1 - discountAmount / 100);
                actualDiscountAmount = originalPrice - salePrice;
            } else if (discountType === 2) {
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

        const existingEarning = await models.InstructorEarnings.findOne({
            sale: sale._id,
            product_id: item.product
        });

        if (existingEarning) {
            console.log(`   ⚠️ Ganancia ya existe para producto ${item.product}. Saltando...`);
            return false;
        }

        const settings = await models.PlatformCommissionSettings.findOne();
        const DEFAULT_COMMISSION = settings?.default_commission_rate ?? 30;
        const REFERRAL_COMMISSION = 20;

        let commissionRatePercent = DEFAULT_COMMISSION;
        let isReferral = false;

        if (sale.is_referral && sale.coupon_code) {
            const coupon = await models.Coupon.findOne({ code: sale.coupon_code.trim().toUpperCase() });

            if (!coupon) {
                console.warn(`   ⚠️ [REFERIDO] Cupón "${sale.coupon_code}" no encontrado → comisión normal`);
            } else {
                const instructorMatch = coupon.instructor.toString() === instructorId.toString();
                const productMatch = coupon.projects.some(p => p.toString() === item.product.toString());

                if (instructorMatch && productMatch) {
                    commissionRatePercent = REFERRAL_COMMISSION;
                    isReferral = true;
                    console.log(`   ✅ [REFERIDO] Comisión 80/20 aplicada`);
                }
            }
        } else if (sale.is_referral && !sale.coupon_code) {
            commissionRatePercent = REFERRAL_COMMISSION;
            isReferral = true;
        }

        const commissionRate = commissionRatePercent / 100;
        const totalDaysUntilAvailable = settings?.days_until_available !== undefined ? settings.days_until_available : 7;

        const isStripe = sale.method_payment === 'stripe' || sale.method_payment === 'mixed_stripe';
        const isWallet = sale.method_payment === 'wallet';

        let splitResult;
        if (isWallet) {
            splitResult = { totalPaid: parseFloat(salePrice.toFixed(2)), paypalFee: 0, stripeFee: 0, netAmount: parseFloat(salePrice.toFixed(2)), currency: sale.currency_payment || 'MXN' };
        } else {
            splitResult = calculatePaymentSplit(salePrice, 'stripe');
        }

        const gatewayFee = splitResult.paypalFee;
        const netSale = splitResult.netAmount;

        let platformCommission = 0;
        let instructorEarning = 0;

        if (netSale > 0) {
            platformCommission = parseFloat((netSale * commissionRate).toFixed(2));
            instructorEarning  = parseFloat((netSale - platformCommission).toFixed(2));
        }

        const availableAt = new Date();
        availableAt.setDate(availableAt.getDate() + totalDaysUntilAvailable);

        const earningStatus = totalDaysUntilAvailable === 0 ? 'available' : 'pending';

        const newEarning = await models.InstructorEarnings.create({
            instructor: instructorId,
            sale: sale._id,
            product_id: item.product,
            product_type: item.product_type,
            sale_price: salePrice,
            currency: sale.currency_total || sale.currency_payment || 'MXN',
            payment_method: sale.method_payment || 'wallet',
            payment_fee_rate: 0,
            payment_fee_amount: gatewayFee,
            platform_commission_rate: commissionRate,
            platform_commission_amount: platformCommission,
            instructor_earning: instructorEarning,
            instructor_earning_usd: instructorEarning,
            is_referral: isReferral,
            discount_info: {
                original_price: originalPrice,
                discount_amount: actualDiscountAmount,
                discount_type: discountType,
                discount_percentage: discountPercentage,
                campaign_discount: item.campaign_discount || null
            },
            status: earningStatus,
            earned_at: new Date(),
            available_at: availableAt
        });

        console.log(`   ✅ Ganancia creada para instructor ${instructorId}:`);
        console.log(`      💵 Precio venta: ${salePrice.toFixed(2)}`);
        console.log(`      🏛 Comisión plataforma (${(commissionRate * 100).toFixed(0)}%): ${platformCommission.toFixed(2)}`);
        console.log(`      💰 Ganancia instructor: ${instructorEarning.toFixed(2)}`);

        await TaxBreakdownService.calculateBreakdown(sale, newEarning);

        return true;
    } catch (error) {
        console.error(`   ❌ Error al crear ganancia:`, error.message);
        return false;
    }
}

/**
 * 🎯 Procesar venta pagada — Inscripciones, ganancias, correo y Telegram
 */
export async function processPaidSale(sale, userId) {
    console.log(`\n🎯 [processPaidSale] Procesando venta ${sale._id}...`);
    console.log(`   👤 Usuario: ${userId}`);

    const items = sale.detail || sale.sale_details || [];

    for (const item of items) {
        console.log(`\n   ─────────────────────────────────`);
        console.log(`   📦 Item: ${item.title || 'Producto'}`);
        console.log(`   🏷️  Tipo: ${item.product_type || item.type_detail}`);

        const type = item.product_type || item.type_detail;
        const rawProductRef = item.product || item.course || item.project;
        const productId = (rawProductRef && typeof rawProductRef === 'object' && rawProductRef._id)
            ? rawProductRef._id
            : rawProductRef;

        if (type === 'course') {
            console.log(`   📚 Inscribiendo en curso...`);
            await enrollStudent(userId, productId);
        } else if (type === 'project') {
            console.log(`   📦 Proyecto: acceso otorgado automáticamente`);
        }

        console.log(`   💰 Creando ganancia para instructor...`);
        const earningItem = {
            product: productId,
            product_type: type,
            title: item.title,
            price_unit: item.price_unit,
            discount: item.discount || 0,
            type_discount: item.type_discount || 0,
            campaign_discount: item.campaign_discount || null
        };

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

    // ── Notificaciones post-pago (en background, sin bloquear) ──────────────
    setImmediate(async () => {
        try {
            // Cargar usuario completo para las notificaciones
            const user = await models.User.findById(userId).lean();
            if (!user) return;

            // 1. 📧 Correo de confirmación al COMPRADOR
            await sendPurchaseConfirmation({ user, sale }).catch(err =>
                console.error('⚠️ [processPaidSale] Error enviando correo:', err.message)
            );

            // 2. 📱 Telegram al ADMIN: nueva compra realizada
            await notifyAdminNewSale(sale, user).catch(err =>
                console.error('⚠️ [processPaidSale] Error Telegram admin:', err.message)
            );

            // 3. 📱 Telegram al USUARIO (si tiene cuenta vinculada): pago aprobado
            await notifyPaymentApproved({ ...sale, user }).catch(err =>
                console.error('⚠️ [processPaidSale] Error Telegram usuario:', err.message)
            );

            console.log(`📬 [processPaidSale] Notificaciones enviadas para venta ${sale._id}`);
        } catch (err) {
            console.error('⚠️ [processPaidSale] Error en notificaciones post-pago:', err.message);
        }
    });
}

export { createEarningForProduct };

export default {
    processPaidSale,
    createEarningForProduct
};
