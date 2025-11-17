import models from '../models/index.js';

// Configuración de días para reembolso
const REFUND_DAYS_LIMIT = 7; // 7 días para solicitar reembolso

// Listar reembolsos (Admin ve todos, Instructor/Cliente solo los suyos)
export async function list(req, res) {
    try {
        console.log('🔍 [RefundController.list] Iniciando...');
        
        if (!req.user) {
            console.error('❌ [RefundController.list] Usuario no autenticado');
            return res.status(401).send({ message: 'No autenticado' });
        }

        const user = req.user;
        const userObj = user.toObject ? user.toObject() : user;
        
        console.log('👤 [RefundController.list] Usuario completo:', {
            id: userObj._id,
            rol: userObj.rol,
            name: userObj.name
        });
        
        let filter = { state: 1 };

        if (userObj.rol === 'instructor') {
            console.log('👨‍🏫 [RefundController.list] Modo instructor');
            const courses = await models.Course.find({ user: userObj._id }).select('_id');
            const projects = await models.Project.find({ user: userObj._id }).select('_id');
            
            console.log('📚 [RefundController.list] Cursos del instructor:', courses.length);
            console.log('📁 [RefundController.list] Proyectos del instructor:', projects.length);
            
            if (courses.length > 0 || projects.length > 0) {
                filter.$or = [
                    { course: { $in: courses.map(c => c._id) } },
                    { project: { $in: projects.map(p => p._id) } }
                ];
            } else {
                console.log('⚠️ [RefundController.list] Instructor sin cursos/proyectos');
                return res.status(200).send([]);
            }
        } else if (userObj.rol === 'cliente') {
            console.log('👨‍💼 [RefundController.list] Modo cliente');
            filter.user = userObj._id;
        } else if (userObj.rol === 'admin') {
            console.log('👑 [RefundController.list] Modo admin - ve todos');
        } else {
            console.log('⚠️ [RefundController.list] Rol desconocido:', userObj.rol);
            filter.user = userObj._id;
        }

        console.log('🔍 [RefundController.list] Filtro aplicado:', JSON.stringify(filter));

        const refunds = await models.Refund.find(filter)
            .populate('user', 'name surname email')
            .populate('course', 'title')
            .populate('project', 'title')
            .populate('sale')
            .populate('reviewedBy', 'name surname')
            .sort({ requestedAt: -1 });

        console.log('✅ [RefundController.list] Reembolsos encontrados:', refunds.length);
        res.status(200).send(refunds);
    } catch (error) {
        console.error('❌ [RefundController.list] Error completo:', error);
        console.error('❌ [RefundController.list] Stack:', error.stack);
        res.status(500).send({ 
            message: 'Error al obtener reembolsos',
            error: error.message 
        });
    }
}

// Crear solicitud de reembolso (Cliente)
export async function create(req, res) {
    try {
        const user = req.user;
        const userObj = user.toObject ? user.toObject() : user;
        const data = req.body;

        const sale = await models.Sale.findById(data.sale_id);
        if (!sale) {
            return res.status(404).send({ message: 'Venta no encontrada' });
        }

        if (sale.user.toString() !== userObj._id.toString()) {
            return res.status(403).send({ message: 'No tienes permiso para solicitar este reembolso' });
        }

        const existingRefund = await models.Refund.findOne({ 
            sale: data.sale_id, 
            status: { $nin: ['rejected', 'failed'] } 
        });
        
        if (existingRefund) {
            return res.status(400).send({ 
                message: 'Ya existe una solicitud de reembolso para esta compra' 
            });
        }

        // 🆕 YA NO SE REQUIEREN DATOS BANCARIOS - solo motivo y descripción
        const refund = new models.Refund({
            sale: data.sale_id,
            user: userObj._id,
            course: sale.course || null,
            project: sale.project || null,
            originalAmount: sale.total,
            currency: sale.currency_total || 'USD',
            reason: {
                type: data.reason_type,
                description: data.reason_description
            },
            refundDetails: {
                // Ya no almacenamos datos bancarios
                bankAccount: '',
                bankName: '',
                accountHolder: ''
            }
        });

        refund.calculateRefund();
        await refund.save();

        res.status(201).send({ 
            message: 'Solicitud de reembolso creada exitosamente',
            refund: refund
        });
    } catch (error) {
        console.error('❌ Error al crear reembolso:', error);
        res.status(500).send({ message: 'Error al crear solicitud de reembolso' });
    }
}

// Calcular preview del reembolso (antes de crear la solicitud)
export async function calculatePreview(req, res) {
    try {
        const { sale_id } = req.query;
        const user = req.user;
        const userObj = user.toObject ? user.toObject() : user;

        const sale = await models.Sale.findById(sale_id);
        if (!sale) {
            return res.status(404).send({ message: 'Venta no encontrada' });
        }

        const tempRefund = new models.Refund({
            sale: sale_id,
            user: userObj._id,
            originalAmount: sale.total
        });

        const calculations = tempRefund.calculateRefund();

        res.status(200).send({
            originalAmount: sale.total,
            currency: sale.currency_total || 'USD',
            breakdown: calculations
        });
    } catch (error) {
        console.error('❌ Error al calcular preview:', error);
        res.status(500).send({ message: 'Error al calcular reembolso' });
    }
}

// Revisar y aprobar/rechazar reembolso (Admin/Instructor)
export async function review(req, res) {
    try {
        const user = req.user;
        const userObj = user.toObject ? user.toObject() : user;
        const { id } = req.params;
        const { status, admin_notes } = req.body;

        console.log(`📋 [RefundController.review] Iniciando revisión para refund: ${id}, nuevo status: ${status}`);

        const refund = await models.Refund.findById(id)
            .populate('course')
            .populate('project')
            .populate('user');

        if (!refund) {
            return res.status(404).send({ message: 'Reembolso no encontrado' });
        }

        // Verificar permisos
        if (userObj.rol === 'instructor') {
            const isOwner = 
                (refund.course && refund.course.user.toString() === userObj._id.toString()) ||
                (refund.project && refund.project.user.toString() === userObj._id.toString());
            
            if (!isOwner) {
                return res.status(403).send({ message: 'No tienes permiso para revisar este reembolso' });
            }
        }

        // Actualizar datos básicos
        refund.adminNotes = admin_notes;
        refund.reviewedBy = userObj._id;
        refund.reviewedAt = new Date();

        let earningUpdate = null;

        if (status === 'approved') {
            console.log('💰 [RefundController.review] APROBANDO REEMBOLSO Y ACREDITANDO A BILLETERA');
            
            // 🔒 PASO 1: VALIDAR SI EL INSTRUCTOR YA FUE PAGADO
            console.log('🔒 [RefundController.review] Verificando si instructor ya fue pagado...');
            
            const paidEarnings = await models.InstructorEarnings.findOne({
                sale: refund.sale,
                $or: [
                    { course: refund.course },
                    { product_id: refund.project }
                ],
                status: { $in: ['paid', 'completed'] }
            });

            if (paidEarnings) {
                console.log('❌ [RefundController.review] BLOQUEADO: Instructor ya fue pagado');
                return res.status(400).send({ 
                    message: 'No se puede completar el reembolso porque el instructor ya fue pagado.',
                    reason: 'instructor_already_paid',
                    earning_id: paidEarnings._id,
                    paid_at: paidEarnings.paid_at
                });
            }

            console.log('✅ [RefundController.review] Instructor NO ha sido pagado, continuando...');
            
            // 🔥 PASO 2: MARCAR GANANCIA COMO REEMBOLSADA
            console.log('🔥 [RefundController.review] Actualizando InstructorEarnings...');
            
            earningUpdate = await models.InstructorEarnings.findOneAndUpdate(
                {
                    sale: refund.sale,
                    $or: [
                        { course: refund.course },
                        { product_id: refund.project }
                    ],
                    status: { $in: ['pending', 'available'] }
                },
                {
                    $set: {
                        status: 'refunded',
                        refund_reference: refund._id,
                        refunded_at: new Date(),
                        admin_notes: `Reembolsado - No pagar al instructor`
                    }
                },
                { new: true }
            );

            if (earningUpdate) {
                console.log('✅ [RefundController.review] InstructorEarnings actualizado:', {
                    earning_id: earningUpdate._id,
                    instructor: earningUpdate.instructor,
                    old_status: 'available/pending',
                    new_status: 'refunded',
                    amount_blocked: earningUpdate.instructor_earning
                });
            } else {
                console.log('⚠️ [RefundController.review] No se encontró InstructorEarnings para actualizar');
            }
            
            // 🚀 PASO 3: ACREDITAR SALDO A LA BILLETERA
            try {
                const { creditRefund } = await import('./WalletController.js');
                
                const refundAmount = refund.calculations.refundAmount;
                const userId = refund.user._id || refund.user;
                
                console.log(`💵 [RefundController.review] Acreditando ${refundAmount} a usuario ${userId}`);
                
                const walletResult = await creditRefund(
                    userId,
                    refundAmount,
                    refund._id,
                    `Reembolso por ${refund.course?.title || refund.project?.title || 'compra'}`
                );
                
                console.log('✅ [RefundController.review] Saldo acreditado exitosamente:', walletResult);
                
                // ✅ Marcar como completado inmediatamente
                refund.status = 'completed';
                refund.completedAt = new Date();
                refund.processedAt = new Date();
                
                // 🔥 Obtener el _id de la transacción
                if (walletResult && walletResult.transaction && walletResult.transaction._id) {
                    refund.refundDetails.receiptNumber = `WALLET-${walletResult.transaction._id}`;
                } else {
                    const wallet = await models.Wallet.findOne({ user: userId });
                    if (wallet && wallet.transactions.length > 0) {
                        const lastTransaction = wallet.transactions[wallet.transactions.length - 1];
                        refund.refundDetails.receiptNumber = `WALLET-${lastTransaction._id}`;
                    } else {
                        refund.refundDetails.receiptNumber = `WALLET-${Date.now()}`;
                    }
                }
                
                refund.refundDetails.receiptImage = '';
                
            } catch (walletError) {
                console.error('❌ [RefundController.review] Error al acreditar a billetera:', walletError);
                return res.status(500).send({ 
                    message: 'Error al acreditar el reembolso a la billetera',
                    error: walletError.message
                });
            }
            
            // 🗑️ PASO 4: ELIMINAR ACCESO DEL ESTUDIANTE
            console.log('🗑️ [RefundController.review] Eliminando acceso del estudiante...');
            
            if (refund.course) {
                try {
                    const deletedEnrollment = await models.CourseStudent.deleteOne({
                        user: refund.user._id || refund.user,
                        course: refund.course
                    });
                    
                    if (deletedEnrollment.deletedCount > 0) {
                        console.log('✅ [RefundController.review] Acceso al curso eliminado');
                    }
                } catch (deleteError) {
                    console.error('❌ [RefundController.review] Error al eliminar acceso:', deleteError);
                    // No fallar el proceso completo
                }
            }
            
        } else if (status === 'rejected') {
            refund.status = 'rejected';
        }

        await refund.save();

        const message = status === 'approved' 
            ? '✅ Reembolso aprobado, ganancia bloqueada y acreditado a billetera'
            : '❌ Reembolso rechazado';

        res.status(200).send({ 
            message: message,
            refund: refund,
            earning_blocked: !!earningUpdate
        });

    } catch (error) {
        console.error('❌ [RefundController.review] Error:', error);
        res.status(500).send({ message: 'Error al revisar reembolso', error: error.message });
    }
}

// Solicitar un reembolso (cliente desde la tienda)
export async function requestRefund(req, res) {
    try {
        const user = req.user;
        const userObj = user.toObject ? user.toObject() : user;
        const userId = userObj._id;
        const { sale_id, reason_type, reason_description, bank_account, bank_name, account_holder } = req.body;

        console.log('🔍 [RefundController.requestRefund] Datos recibidos:', {
            userId: userId.toString(),
            sale_id,
            reason_type,
            hasDescription: !!reason_description,
            hasBankInfo: !!bank_account
        });

        if (!sale_id) {
            return res.status(400).send({ message: 'El ID de la venta es requerido.' });
        }

        // 1. Validar la venta
        const sale = await models.Sale.findById(sale_id);
        if (!sale) {
            console.error('❌ [RefundController.requestRefund] Venta no encontrada');
            return res.status(404).send({ message: 'Venta no encontrada.' });
        }

        console.log('🔍 [RefundController.requestRefund] Venta encontrada:', {
            saleId: sale._id,
            saleUserId: sale.user.toString(),
            requestingUserId: userId.toString(),
            match: sale.user.toString() === userId.toString(),
            total: sale.total,
            currency: sale.currency_total,
            status: sale.status,
            createdAt: sale.createdAt
        });

        if (sale.user.toString() !== userId.toString()) {
            return res.status(403).send({ message: 'No tienes permiso para solicitar un reembolso por esta venta.' });
        }

        // 2. Verificar si la venta es reembolsable (7 días)
        const now = new Date();
        const purchaseDate = new Date(sale.createdAt);
        const timeSincePurchase = now.getTime() - purchaseDate.getTime();
        const daysInMilliseconds = REFUND_DAYS_LIMIT * 24 * 60 * 60 * 1000;

        if (timeSincePurchase >= daysInMilliseconds) {
            console.log('⚠️ [RefundController.requestRefund] Período de reembolso expirado:', {
                timeSincePurchase: Math.floor(timeSincePurchase / (24 * 60 * 60 * 1000)) + ' días',
                limit: REFUND_DAYS_LIMIT + ' días'
            });
            return res.status(400).send({ 
                message: `El período para solicitar un reembolso ha expirado (${REFUND_DAYS_LIMIT} días desde la compra).`,
                daysLimit: REFUND_DAYS_LIMIT,
                daysSincePurchase: Math.floor(timeSincePurchase / (24 * 60 * 60 * 1000))
            });
        }

        // 3. Verificar que no exista ya una solicitud de reembolso activa
        const existingRefund = await models.Refund.findOne({ 
            sale: sale_id, 
            status: { $in: ['pending', 'approved', 'processing'] },
            state: 1
        });
        
        if (existingRefund) {
            return res.status(400).send({ 
                message: 'Ya existe una solicitud de reembolso activa para esta compra.' 
            });
        }

        // 4. Extraer course y project del detalle de la venta
        let courseId = null;
        let projectId = null;
        
        if (sale.detail && sale.detail.length > 0) {
            for (const item of sale.detail) {
                if (item.product_type === 'course' && !courseId) {
                    courseId = item.product;
                }
                if (item.product_type === 'project' && !projectId) {
                    projectId = item.product;
                }
            }
        }

        console.log('🔍 [RefundController.requestRefund] Productos encontrados:', {
            courseId: courseId ? courseId.toString() : 'ninguno',
            projectId: projectId ? projectId.toString() : 'ninguno'
        });

        // 5. ✅ NUEVA VALIDACIÓN: Verificar si ya se pagó al instructor
        let instructorAlreadyPaid = false;
        
        if (courseId || projectId) {
            const paidEarnings = await models.InstructorEarnings.findOne({
                sale: sale_id,
                $or: [
                    { course: courseId },
                    { product_id: projectId }
                ],
                status: { $in: ['paid', 'completed'] }
            });

            if (paidEarnings) {
                instructorAlreadyPaid = true;
                console.log('⚠️ [RefundController.requestRefund] Instructor ya fue pagado:', {
                    earning_id: paidEarnings._id,
                    status: paidEarnings.status
                });
                
                return res.status(400).send({ 
                    message: 'No se puede procesar el reembolso porque el pago al instructor ya fue realizado.',
                    reason: 'instructor_already_paid'
                });
            }
        }

        console.log('✅ [RefundController.requestRefund] Validaciones pasadas, instructor no ha sido pagado');

        // 6. Crear la solicitud de reembolso
        console.log('💾 [RefundController.requestRefund] Creando nuevo reembolso...');
        
        const newRefund = new models.Refund({
            user: userId,
            sale: sale_id,
            course: courseId,
            project: projectId,
            originalAmount: sale.total,
            currency: sale.currency_total || 'USD',
            reason: {
                type: reason_type || 'other',
                description: reason_description || 'Sin descripción'
            },
            refundDetails: {
                bankAccount: bank_account || '',
                bankName: bank_name || '',
                accountHolder: account_holder || ''
            },
            status: 'pending',
            state: 1
        });

        console.log('🧮 [RefundController.requestRefund] Calculando reembolso...');
        
        try {
            newRefund.calculateRefund();
            console.log('✅ [RefundController.requestRefund] Cálculo completado:', newRefund.calculations);
        } catch (calcError) {
            console.error('❌ [RefundController.requestRefund] Error en calculateRefund:', calcError);
            throw calcError;
        }

        console.log('💾 [RefundController.requestRefund] Guardando en base de datos...');
        await newRefund.save();

        console.log('✅ [RefundController.requestRefund] Reembolso creado:', newRefund._id);

        // 7. Poblar datos para la respuesta
        const populatedRefund = await models.Refund.findById(newRefund._id)
            .populate('user', 'name surname email')
            .populate('course', 'title')
            .populate('project', 'title')
            .populate('sale');

        res.status(201).send({ 
            message: 'Tu solicitud de reembolso ha sido enviada correctamente. Te notificaremos cuando sea procesada.',
            refund: populatedRefund
        });

    } catch (error) {
        console.error('❌ [RefundController.requestRefund] Error completo:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        res.status(500).send({ 
            message: 'Ocurrió un error al procesar tu solicitud.',
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

export async function markCompleted(req, res) {
    try {
        const { id } = req.params;
        const { receipt_number, receipt_image } = req.body;

        const refund = await models.Refund.findById(id);
        if (!refund) {
            return res.status(404).send({ message: 'Reembolso no encontrado' });
        }

        if (refund.status !== 'processing') {
            return res.status(400).send({ 
                message: 'El reembolso debe estar en estado "procesando"' 
            });
        }

        refund.status = 'completed';
        refund.refundDetails.receiptNumber = receipt_number;
        refund.refundDetails.receiptImage = receipt_image;
        refund.completedAt = new Date();
        refund.processedAt = new Date();

        await refund.save();

        res.status(200).send({ 
            message: 'Reembolso marcado como completado',
            refund: refund
        });
    } catch (error) {
        console.error('❌ Error al completar reembolso:', error);
        res.status(500).send({ message: 'Error al completar reembolso' });
    }
}

// Obtener estadísticas de reembolsos (Admin)
export async function statistics(req, res) {
    try {
        const stats = await models.Refund.aggregate([
            { $match: { state: 1 } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalOriginal: { $sum: '$originalAmount' },
                    totalRefunded: { $sum: '$calculations.refundAmount' }
                }
            }
        ]);

        const totalStats = await models.Refund.aggregate([
            { $match: { state: 1 } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    totalOriginalAmount: { $sum: '$originalAmount' },
                    totalRefundedAmount: { $sum: '$calculations.refundAmount' },
                    avgRefundPercentage: { $avg: '$calculations.refundPercentage' }
                }
            }
        ]);

        res.status(200).send({
            byStatus: stats,
            overall: totalStats[0] || {}
        });
    } catch (error) {
        console.error('❌ Error al obtener estadísticas:', error);
        res.status(500).send({ message: 'Error al obtener estadísticas' });
    }
}

// ✅ NUEVO: Verificar elegibilidad de reembolso
export async function checkRefundEligibility(req, res) {
    try {
        const { sale_id } = req.query;
        const user = req.user;
        const userObj = user.toObject ? user.toObject() : user;

        if (!sale_id) {
            return res.status(400).send({ message: 'El ID de la venta es requerido.' });
        }

        const sale = await models.Sale.findById(sale_id);
        if (!sale) {
            return res.status(404).send({ message: 'Venta no encontrada.' });
        }

        if (sale.user.toString() !== userObj._id.toString()) {
            return res.status(403).send({ message: 'No tienes permiso para verificar esta venta.' });
        }

        // Verificar tiempo límite
        const now = new Date();
        const purchaseDate = new Date(sale.createdAt);
        const timeSincePurchase = now.getTime() - purchaseDate.getTime();
        const daysInMilliseconds = REFUND_DAYS_LIMIT * 24 * 60 * 60 * 1000;
        const daysSincePurchase = Math.floor(timeSincePurchase / (24 * 60 * 60 * 1000));
        const daysRemaining = REFUND_DAYS_LIMIT - daysSincePurchase;

        const isWithinTimeLimit = timeSincePurchase < daysInMilliseconds;

        // Verificar si ya existe un reembolso
        const existingRefund = await models.Refund.findOne({ 
            sale: sale_id, 
            status: { $in: ['pending', 'approved', 'processing', 'completed'] },
            state: 1
        });

        // Verificar si el instructor ya fue pagado
        let instructorAlreadyPaid = false;
        
        if (sale.detail && sale.detail.length > 0) {
            for (const item of sale.detail) {
                const productId = item.product;
                
                const paidEarnings = await models.InstructorEarnings.findOne({
                    sale: sale_id,
                    $or: [
                        { course: productId },
                        { product_id: productId }
                    ],
                    status: { $in: ['paid', 'completed'] }
                });

                if (paidEarnings) {
                    instructorAlreadyPaid = true;
                    break;
                }
            }
        }

        const isEligible = isWithinTimeLimit && !existingRefund && !instructorAlreadyPaid && sale.status === 'Pagado';

        res.status(200).send({
            isEligible,
            isWithinTimeLimit,
            hasExistingRefund: !!existingRefund,
            instructorAlreadyPaid,
            daysSincePurchase,
            daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
            daysLimit: REFUND_DAYS_LIMIT,
            saleStatus: sale.status,
            existingRefundStatus: existingRefund?.status || null,
            reasons: {
                timeExpired: !isWithinTimeLimit,
                alreadyRequested: !!existingRefund,
                instructorPaid: instructorAlreadyPaid,
                notPaid: sale.status !== 'Pagado'
            }
        });

    } catch (error) {
        console.error('❌ Error al verificar elegibilidad:', error);
        res.status(500).send({ message: 'Error al verificar elegibilidad de reembolso' });
    }
}
