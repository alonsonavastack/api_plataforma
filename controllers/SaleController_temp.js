_price; // Precio después de descuento
            const platformCommissionAmount = (salePrice * commissionRate) / 100;
            const instructorEarning = salePrice - platformCommissionAmount;

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
                instructor_earning_usd: instructorEarning, // Por ahora USD = USD
                
                // Estado y fechas
                status: daysUntilAvailable === 0 ? 'available' : 'pending',
                earned_at: new Date(),
                available_at: availableAt,
            };

            // Guardar en base de datos
            await models.InstructorEarnings.create(earningData);
            console.log(`✅ Ganancia creada: ${instructorEarning.toFixed(2)} ${sale.currency_total || 'USD'} para instructor ${instructorId}`);
        }

        console.log(`✅ Todas las ganancias fueron creadas para la venta ${sale._id}`);
    } catch (error) {
        console.error(`❌ Error al crear ganancias para venta ${sale._id}:`, error);
        // No lanzar error para no bloquear el flujo de la venta
    }
}

/**
 * Inscribe a un estudiante en un curso, evitando duplicados.
 * @param {string} userId - ID del usuario a inscribir.
 * @param {string} courseId - ID del curso.
 */
async function enrollStudent(userId, courseId) {
    try {
        const existingEnrollment = await models.CourseStudent.findOne({
            user: userId,
            course: courseId,
        });

        if (!existingEnrollment) {
            await models.CourseStudent.create({ user: userId, course: courseId });
            console.log(`Inscripción creada para usuario ${userId} en curso ${courseId}.`);
        }
    } catch (error) {
        console.error(`Error al inscribir al estudiante ${userId} en el curso ${courseId}:`, error);
    }
}
