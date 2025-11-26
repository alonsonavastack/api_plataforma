/**
 * REEMPLAZO PARA getInstructorEarnings en AdminInstructorPaymentController.js
 * Líneas aproximadamente 253-315
 */

export const getInstructorEarnings = async (req, res) => {
    try {
        const { id: instructorId } = req.params;
        const { status, startDate, endDate } = req.query;

        console.log(`🔍 [getInstructorEarnings] Instructor: ${instructorId}, status: ${status || 'all'}`);

        // Construir filtros
        const filters = {
            instructor: instructorId
        };

        if (status && status !== 'all') {
            filters.status = status;
        } else {
            filters.status = { $nin: ['paid', 'completed', 'refunded'] };
        }

        if (startDate || endDate) {
            filters.earned_at = {};
            if (startDate) filters.earned_at.$gte = new Date(startDate);
            if (endDate) filters.earned_at.$lte = new Date(endDate);
        }

        console.log(`🔍 [getInstructorEarnings] Buscando earnings con filtros:`, filters);

        // 🔥 OBTENER EARNINGS CON POPULATE DE SALE
        const allEarnings = await InstructorEarnings.find(filters)
            .populate('course', 'title imagen')
            .populate('product_id', 'title imagen')
            .populate('sale', 'n_transaccion created_at user') // 🔥 CRÍTICO: Popular sale
            .sort({ earned_at: -1 });

        console.log(`📦 [getInstructorEarnings] Earnings obtenidos: ${allEarnings.length}`);

        // 🔥 FILTRAR EARNINGS CON REFUNDS COMPLETADOS
        const validEarnings = await filterEarningsWithRefunds(allEarnings);

        console.log(`✅ [getInstructorEarnings] Ganancias válidas después de filtrar refunds: ${validEarnings.length}`);

        // Logs de desglose por estado
        console.log(`📊 [getInstructorEarnings] Desglose por estado:`);
        const countByStatus = {};
        validEarnings.forEach(e => {
            countByStatus[e.status] = (countByStatus[e.status] || 0) + 1;
        });
        console.log(`   Estados:`, countByStatus);

        // Formatear earnings
        const formattedEarnings = validEarnings.map(earning => {
            const earningObj = earning.toObject();

            if (earningObj.product_id) {
                earningObj.product = earningObj.product_id;
                earningObj.product_type = 'project';
            } else if (earningObj.course) {
                earningObj.product = earningObj.course;
                earningObj.product_type = 'course';
            }

            return earningObj;
        });

        // Calcular totales
        const totals = calculateTotalEarnings(validEarnings);

        // Obtener configuración del instructor
        const instructor = await User.findById(instructorId).select('name email surname');
        const paymentConfig = await InstructorPaymentConfig.findOne({ instructor: instructorId });

        res.json({
            success: true,
            instructor,
            earnings: formattedEarnings,
            totals,
            paymentConfig
        });
    } catch (error) {
        console.error('❌ Error al obtener ganancias del instructor:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener ganancias del instructor',
            error: error.message
        });
    }
};
