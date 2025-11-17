// 🔥 REEMPLAZAR LA FUNCIÓN review() EN RefundController.js

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
            
            const earningUpdate = await models.InstructorEarnings.findOneAndUpdate(
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
