// controllers/TransferVerificationController.js
// 🏦 SISTEMA COMPLETO DE VERIFICACIÓN DE TRANSFERENCIAS BANCARIAS

import Sale from '../models/Sale.js';
import CourseStudent from '../models/CourseStudent.js';
import Course from '../models/Course.js';
import Project from '../models/Project.js';
import InstructorEarnings from '../models/InstructorEarnings.js';
import PlatformCommissionSettings from '../models/PlatformCommissionSettings.js';
import User from '../models/User.js';
import FiscalService from '../service/fiscal.service.js';
import Notification from '../models/Notification.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TransferVerificationController = {

  /**
   * 📋 LISTAR TRANSFERENCIAS PENDIENTES
   * GET /api/transfers/pending
   */
  listPendingTransfers: async (req, res) => {
    try {
      console.log('📋 [TransferVerification] Obteniendo transferencias pendientes');
      
      // Filtros opcionales
      const { status, dateFrom, dateTo, userId } = req.query;
      
      let query = {
        method_payment: 'transfer'
      };
      
      // Si no se especifica status, mostrar solo pendientes
      if (status) {
        query.status = status;
      } else {
        query.status = 'Pendiente';
      }
      
      // Filtro por fecha
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }
      
      // Filtro por usuario
      if (userId) {
        query.user = userId;
      }
      
      const transfers = await Sale.find(query)
        .populate('user', 'name surname email avatar')
        .populate('detail.product')
        .populate('transfer_receipt.admin_verification.verified_by', 'name surname')
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      console.log(`✅ [TransferVerification] ${transfers.length} transferencias encontradas`);

      res.status(200).send({
        transfers,
        count: transfers.length
      });

    } catch (error) {
      console.error('❌ [TransferVerification] Error al listar transferencias:', error);
      res.status(500).send({
        message: 'Error al obtener transferencias',
        error: error.message
      });
    }
  },

  /**
   * ✅ VERIFICAR Y APROBAR TRANSFERENCIA
   * POST /api/transfers/verify/:id
   * Body: { verification_notes?, receipt (file) }
   */
  verifyTransfer: async (req, res) => {
    try {
      const saleId = req.params.id;
      const adminId = req.user.sub;
      
      console.log('🔍 [TransferVerification] Iniciando verificación:', {
        saleId,
        adminId,
        hasFile: !!req.files?.receipt
      });

      // 1️⃣ VALIDAR QUE EXISTE LA VENTA
      const sale = await Sale.findById(saleId)
        .populate('user', 'name surname email')
        .populate('detail.product');

      if (!sale) {
        return res.status(404).send({ message: 'Venta no encontrada' });
      }

      // 2️⃣ VALIDAR QUE ES TRANSFERENCIA
      if (sale.method_payment !== 'transfer') {
        return res.status(400).send({ 
          message: 'Esta venta no es por transferencia bancaria' 
        });
      }

      // 3️⃣ VALIDAR QUE ESTÁ PENDIENTE
      if (sale.status !== 'Pendiente') {
        return res.status(400).send({ 
          message: `Esta transferencia ya está en estado: ${sale.status}` 
        });
      }

      // 4️⃣ PROCESAR COMPROBANTE (SI EXISTE)
      let receiptFileName = null;
      if (req.files && req.files.receipt) {
        const file = req.files.receipt;
        const timestamp = Date.now();
        const ext = path.extname(file.name);
        receiptFileName = `transfer_${saleId}_${timestamp}${ext}`;
        const uploadDir = path.join(__dirname, '../uploads/transfers/');
        const uploadPath = path.join(uploadDir, receiptFileName);

        // Crear directorio si no existe
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
          console.log('📁 [TransferVerification] Directorio creado:', uploadDir);
        }

        fs.writeFileSync(uploadPath, file.data);
        console.log('📎 [TransferVerification] Comprobante guardado:', receiptFileName);
      }

      // 5️⃣ ACTUALIZAR VENTA CON VERIFICACIÓN
      sale.status = 'Pagado';
      sale.transfer_receipt = sale.transfer_receipt || {};
      sale.transfer_receipt.admin_verification = {
        receipt_url: receiptFileName ? `/api/transfers/receipt/${receiptFileName}` : null,
        receipt_file_name: receiptFileName,
        verified_by: adminId,
        verified_at: new Date(),
        verification_notes: req.body.verification_notes || 'Transferencia verificada y aprobada por el administrador'
      };

      await sale.save();

      console.log('✅ [TransferVerification] Venta actualizada a "Pagado"');

      // 6️⃣ INSCRIBIR EN CURSOS/PROYECTOS AUTOMÁTICAMENTE
      // NOTA: El hook pre-save de Sale ya maneja esto, pero lo hacemos explícito aquí también
      for (const item of sale.detail) {
        if (item.product_type === 'course') {
          const existingEnrollment = await CourseStudent.findOne({
            user: sale.user,
            course: item.product
          });

          if (!existingEnrollment) {
            await CourseStudent.create({
              user: sale.user,
              course: item.product
            });
            console.log(`📚 [TransferVerification] Inscripción creada en curso: ${item.product}`);
          } else {
            console.log(`ℹ️  [TransferVerification] Ya inscrito en curso: ${item.product}`);
          }
        }
      }

      // 7️⃣ ENVIAR NOTIFICACIÓN AL ESTUDIANTE
      try {
        await Notification.create({
          user: sale.user,
          type: 'payment_verified',
          title: '✅ Pago Verificado',
          message: `Tu transferencia bancaria ha sido verificada y aprobada. ¡Ya puedes acceder a tus cursos!`,
          data: {
            saleId: sale._id,
            transactionNumber: sale.n_transaccion,
            amount: sale.total,
            currency: sale.currency_total,
            verifiedAt: new Date()
          },
          isRead: false
        });

        console.log('📧 [TransferVerification] Notificación enviada al estudiante');
      } catch (notifError) {
        console.warn('⚠️  [TransferVerification] Error al crear notificación:', notifError.message);
        // No fallar el proceso completo por error en notificación
      }

      // 8️⃣ RETORNAR RESPUESTA EXITOSA
      const populatedSale = await Sale.findById(saleId)
        .populate('user', 'name surname email')
        .populate('detail.product')
        .populate('transfer_receipt.admin_verification.verified_by', 'name surname');

      res.status(200).send({
        message: 'Transferencia verificada exitosamente',
        sale: populatedSale,
        enrollments_created: sale.detail.filter(d => d.product_type === 'course').length
      });

    } catch (error) {
      console.error('❌ [TransferVerification] Error al verificar transferencia:', error);
      res.status(500).send({
        message: 'Error al verificar transferencia',
        error: error.message
      });
    }
  },

  /**
   * 📄 OBTENER COMPROBANTE DE TRANSFERENCIA
   * GET /api/transfers/receipt/:filename
   */
  getReceipt: async (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(__dirname, '../uploads/transfers/', filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).send({ message: 'Comprobante no encontrado' });
      }

      res.sendFile(filePath);

    } catch (error) {
      console.error('❌ [TransferVerification] Error al obtener comprobante:', error);
      res.status(500).send({
        message: 'Error al obtener comprobante',
        error: error.message
      });
    }
  },

  /**
   * 🔄 RECHAZAR TRANSFERENCIA
   * POST /api/transfers/reject/:id
   * Body: { rejection_reason }
   */
  rejectTransfer: async (req, res) => {
    try {
      const saleId = req.params.id;
      const adminId = req.user.sub;
      const { rejection_reason } = req.body;

      if (!rejection_reason) {
        return res.status(400).send({ message: 'Debe proporcionar una razón de rechazo' });
      }

      const sale = await Sale.findById(saleId).populate('user', 'name surname email');

      if (!sale) {
        return res.status(404).send({ message: 'Venta no encontrada' });
      }

      if (sale.method_payment !== 'transfer') {
        return res.status(400).send({ message: 'Esta venta no es por transferencia' });
      }

      if (sale.status !== 'Pendiente') {
        return res.status(400).send({ message: 'Solo se pueden rechazar transferencias pendientes' });
      }

      // Actualizar a estado Cancelado
      sale.status = 'Cancelado';
      sale.transfer_receipt = sale.transfer_receipt || {};
      sale.transfer_receipt.admin_verification = {
        verified_by: adminId,
        verified_at: new Date(),
        verification_notes: `RECHAZADO: ${rejection_reason}`
      };

      await sale.save();

      // Notificar al estudiante
      try {
        await Notification.create({
          user: sale.user,
          type: 'payment_rejected',
          title: '❌ Transferencia Rechazada',
          message: `Tu transferencia ha sido rechazada. Razón: ${rejection_reason}`,
          data: {
            saleId: sale._id,
            rejectionReason: rejection_reason,
            rejectedAt: new Date()
          },
          isRead: false
        });
      } catch (notifError) {
        console.warn('⚠️  Error al crear notificación de rechazo:', notifError.message);
      }

      res.status(200).send({
        message: 'Transferencia rechazada',
        sale
      });

    } catch (error) {
      console.error('❌ [TransferVerification] Error al rechazar transferencia:', error);
      res.status(500).send({
        message: 'Error al rechazar transferencia',
        error: error.message
      });
    }
  },

  /**
   * 📊 ESTADÍSTICAS DE TRANSFERENCIAS
   * GET /api/transfers/stats
   */
  getStats: async (req, res) => {
    try {
      const stats = await Sale.aggregate([
        {
          $match: { method_payment: 'transfer' }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total_amount: { $sum: '$total' }
          }
        }
      ]);

      const formatted = {
        pending: { count: 0, amount: 0 },
        paid: { count: 0, amount: 0 },
        cancelled: { count: 0, amount: 0 }
      };

      stats.forEach(stat => {
        if (stat._id === 'Pendiente') {
          formatted.pending = { count: stat.count, amount: stat.total_amount };
        } else if (stat._id === 'Pagado') {
          formatted.paid = { count: stat.count, amount: stat.total_amount };
        } else if (stat._id === 'Cancelado') {
          formatted.cancelled = { count: stat.count, amount: stat.total_amount };
        }
      });

      res.status(200).send(formatted);

    } catch (error) {
      console.error('❌ [TransferVerification] Error al obtener estadísticas:', error);
      res.status(500).send({
        message: 'Error al obtener estadísticas',
        error: error.message
      });
    }
  }

};

export default TransferVerificationController;
