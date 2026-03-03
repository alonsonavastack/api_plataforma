import models from '../models/index.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
// ESM __dirname shim
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Note: we intentionally do NOT call telegramService here for CFDI operations

// Dynamically import pdfkit at the module level for better performance on repeated calls.
const PDFDocumentPromise = import('pdfkit').catch(err => {
    console.warn('⚠️ pdfkit no está disponible, la generación de PDF será omitida globalmente.', err.message);
    return null; // Handle cases where pdfkit is not installed.
});


// import TaxBreakdownService from '../services/TaxBreakdownService.js'; // Future use for complex reports

export default {
    /**
     * Generar CFDI (Simulado/Placeholder)
     */
    generateCFDI: async (req, res) => {
        try {
            const { retention_id } = req.body;
            console.log(`🔧 generateCFDI called for retention_id=${retention_id}`);

            // Simulación de timbrado
            const retention = await models.InstructorRetention.findById(retention_id);
            if (!retention) {
                console.error(`❌ Retención ${retention_id} no encontrada`);
                return res.status(404).json({ message: 'Retención no encontrada' });
            }
            console.log('ℹ️ Retention loaded:', {
                id: retention._id.toString(),
                status: retention.status,
                instructor: retention.instructor?.toString?.() || retention.instructor
            });

            // Generar UUID real
            const uuid = crypto.randomUUID();
            retention.cfdi_uuid = uuid;
            retention.declaration_date = new Date();
            retention.status = 'declared';

            // Asegurar carpeta de uploads (root/uploads/cfdi)
            const uploadsDir = path.join(__dirname, '..', 'uploads', 'cfdi');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }

            // Crear XML (mock simple)
            const xmlFileName = `cfdi_${retention._id}_${uuid}.xml`;
            const xmlPath = path.join(uploadsDir, xmlFileName);
            const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<CFDI>\n  <UUID>${uuid}</UUID>\n  <Instructor>${retention.instructor}</Instructor>\n  <Periodo>${retention.month}/${retention.year}</Periodo>\n  <Ingresos>${retention.gross_earning.toFixed(2)}</Ingresos>\n  <Retenciones>${retention.total_retention.toFixed(2)}</Retenciones>\n  <Neto>${retention.net_pay.toFixed(2)}</Neto>\n</CFDI>`;
            fs.writeFileSync(xmlPath, xmlContent, 'utf8');
            console.log(`✅ CFDI XML generado: ${xmlPath}`);

            // Crear PDF simple usando PDFKit si está disponible (fallback: solo XML)
            const pdfFileName = `cfdi_${retention._id}_${uuid}.pdf`;
            const pdfPath = path.join(uploadsDir, pdfFileName);
            let pdfGenerated = false;
            try {
                const PDFKit = await PDFDocumentPromise;
                if (!PDFKit) throw new Error('pdfkit module not loaded');
                const doc = new PDFKit.default();
                const writeStream = fs.createWriteStream(pdfPath);
                doc.pipe(writeStream);
                doc.fontSize(14).text('COMPROBANTE FISCAL (CFDI)', { align: 'center' });
                doc.moveDown();
                doc.fontSize(10).text(`UUID: ${uuid}`);
                doc.text(`Periodo: ${retention.month}/${retention.year}`);
                doc.text(`Instructor ID: ${retention.instructor}`);
                doc.text(`Ingresos: ${retention.gross_earning.toFixed(2)} MXN`);
                doc.text(`Retenciones: ${retention.total_retention.toFixed(2)} MXN`);
                doc.text(`Neto: ${retention.net_pay.toFixed(2)} MXN`);
                doc.moveDown();
                doc.text('Este es un comprobante fiscal generado automáticamente (mock).', { italic: true });
                doc.end();

                // Esperar a que el PDF se escriba
                await new Promise((resolve, reject) => {
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                });
                console.log(`✅ CFDI PDF generado: ${pdfPath}`);
                pdfGenerated = true;
            } catch (err) {
                // The warning is now logged once at startup if pdfkit is missing.
            }

            // Guardar nombres de archivo en el documento (PDF solo si se generó)
            retention.cfdi_xml = xmlFileName;
            if (pdfGenerated) retention.cfdi_pdf = pdfFileName;

            await retention.save();

            // Construir URLs públicas
            const baseUrl = process.env.URL_BACKEND ? process.env.URL_BACKEND.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;
            const xmlUrl = `${baseUrl}/uploads/cfdi/${xmlFileName}`;
            const pdfUrl = retention.cfdi_pdf ? `${baseUrl}/uploads/cfdi/${retention.cfdi_pdf}` : null;

            res.status(200).json({
                success: true,
                message: 'CFDI generado correctamente',
                cfdi_uuid: uuid,
                urls: {
                    xml: xmlUrl,
                    pdf: pdfUrl
                }
            });
        } catch (error) {
            console.error('❌ Error al generar CFDI:', error);
            const payload = { success: false, message: 'Error al generar CFDI' };
            if (process.env.NODE_ENV !== 'production') {
                payload.error = error.message;
                payload.stack = error.stack;
            }
            res.status(500).json(payload);
        }
    },

    /**
     * Reenviar notificación de CFDI
     */
    // Obtener enlaces de CFDI (si ya fue generado)
    resendCFDI: async (req, res) => {
        try {
            const { retention_id } = req.body;

            const retention = await models.InstructorRetention.findById(retention_id);
            if (!retention) return res.status(404).json({ message: 'Retención no encontrada' });

            if (retention.status !== 'declared' || !retention.cfdi_xml) {
                return res.status(400).json({ success: false, message: 'CFDI no generado aún' });
            }

            const baseUrl = process.env.URL_BACKEND ? process.env.URL_BACKEND.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;
            const xmlUrl = `${baseUrl}/uploads/cfdi/${retention.cfdi_xml}`;
            const pdfUrl = retention.cfdi_pdf ? `${baseUrl}/uploads/cfdi/${retention.cfdi_pdf}` : null;

            return res.status(200).json({ success: true, message: 'CFDI disponible', urls: { xml: xmlUrl, pdf: pdfUrl } });

        } catch (error) {
            console.error('Error in resendCFDI:', error);
            res.status(500).json({ success: false, message: 'Error al obtener CFDI' });
        }
    },

    /**
     * Obtener desglose de ventas con información fiscal
     */
    getSalesBreakdown: async (req, res) => {
        try {
            const { month, year, instructor_id, instructor_search, status } = req.query;
            console.log('📊 getSalesBreakdown - Parámetros recibidos:', { month, year, instructor_id, instructor_search, status });

            let query = {};

            // Validar que month y year sean números válidos
            if (month && year) {
                const parsedMonth = parseInt(month);
                const parsedYear = parseInt(year);

                if (!isNaN(parsedMonth) && !isNaN(parsedYear)) {
                    query.month = parsedMonth;
                    query.year = parsedYear;
                    console.log('✅ Filtro mes/año aplicado:', { month: parsedMonth, year: parsedYear });
                } else {
                    console.warn('⚠️ Mes o año inválidos, se ignorará el filtro');
                }
            }

            // ✅ Filtro de estado
            if (status && status !== 'all') {
                query.status = status;
                console.log('✅ Filtro estado aplicado:', status);
            }

            // ✅ BÚSQUEDA POR TEXTO: Si se envía instructor_search, buscar por nombre/email
            let instructorIds = [];
            if (instructor_search && instructor_search.trim()) {
                const searchRegex = new RegExp(instructor_search.trim(), 'i');
                const matchingInstructors = await models.User.find({
                    $or: [
                        { name: searchRegex },
                        { surname: searchRegex },
                        { email: searchRegex }
                    ]
                }).select('_id');

                instructorIds = matchingInstructors.map(u => u._id);
                console.log(`🔍 Búsqueda "${instructor_search}" encontró ${instructorIds.length} instructores`);

                if (instructorIds.length > 0) {
                    query.instructor = { $in: instructorIds };
                } else {
                    // Si no se encontraron instructores, retornar vacío
                    console.log('⚠️ No se encontraron instructores con ese criterio de búsqueda');
                    return res.status(200).json({
                        success: true,
                        data: [],
                        pagination: { totalDocs: 0, totalPages: 0, page: 1, limit: 20 },
                        totals: {
                            sales_count: 0,
                            total_gross: 0,
                            total_retentions: 0,
                            total_net_pay: 0,
                            total_stripe_send: 0,
                            platform_net_profit: 0,
                            platform_taxes: 0
                        }
                    });
                }
            }
            // ✅ FILTRO POR ID EXACTO: Si se envía instructor_id (ObjectId)
            else if (instructor_id) {
                if (mongoose.Types.ObjectId.isValid(instructor_id)) {
                    query.instructor = instructor_id;
                    console.log('✅ Filtro instructor (ID) aplicado:', instructor_id);
                } else {
                    console.warn('⚠️ instructor_id inválido, se ignorará el filtro:', instructor_id);
                }
            }

            console.log('🔍 Query final:', query);

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;

            // 1. Get totals for the entire period (ignoring pagination)
            const allRetentions = await models.InstructorRetention.find(query).select('gross_earning total_retention net_pay stripe_send_commission sale');

            let totals = {
                sales_count: allRetentions.length,
                total_gross: 0,
                total_retentions: 0,
                total_net_pay: 0,
                total_stripe_send: 0,
                // Platform Totals
                platform_net_profit: 0,
                platform_taxes: 0
            };

            // Filtrar solo las ventas que existen
            const saleIds = allRetentions
                .filter(r => r.sale)
                .map(r => r.sale);

            // Calculate Instructor Totals
            allRetentions.forEach(r => {
                totals.total_gross += r.gross_earning;
                totals.total_retentions += r.total_retention;
                totals.total_net_pay += r.net_pay;
                totals.total_stripe_send += r.stripe_send_commission || 0;
            });

            // 2. Get Platform Totals
            if (saleIds.length > 0) {
                const platformBreakdowns = await models.PlatformCommissionBreakdown.find({ sale: { $in: saleIds } });
                platformBreakdowns.forEach(p => {
                    totals.platform_net_profit += p.platform_net_profit;
                    totals.platform_taxes += (p.platform_isr + p.platform_iva);
                });
            }

            // 3. Get Paginated Data
            // Buscar total de documentos para la paginación
            const totalDocs = await models.InstructorRetention.countDocuments(query);

            const retentions = await models.InstructorRetention.find(query)
                .populate('instructor', 'name email surname telegram_chat_id')
                .populate('sale', 'code total_amount currency_payment createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            // 4. Attach Platform Breakdown to Paginated Results
            if (retentions.length > 0) {
                // Filtrar solo retenciones que tienen sale definido
                const pageSaleIds = retentions
                    .filter(r => r.sale && r.sale._id)
                    .map(r => r.sale._id);

                const pagePlatformData = pageSaleIds.length > 0
                    ? await models.PlatformCommissionBreakdown.find({ sale: { $in: pageSaleIds } }).lean()
                    : [];

                // Exponer URLs públicas de CFDI si existen
                const baseUrl = process.env.URL_BACKEND ? process.env.URL_BACKEND.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;

                retentions.forEach(retention => {
                    // Solo buscar platform_breakdown si la sale existe
                    if (retention.sale && retention.sale._id) {
                        retention.platform_breakdown = pagePlatformData.find(p => p.sale.toString() === retention.sale._id.toString());
                    }

                    if (retention.cfdi_xml) {
                        retention.cfdi_xml_url = `${baseUrl}/uploads/cfdi/${retention.cfdi_xml}`;
                    }
                    if (retention.cfdi_pdf) {
                        retention.cfdi_pdf_url = `${baseUrl}/uploads/cfdi/${retention.cfdi_pdf}`;
                    }
                });
            }

            console.log('✅ Respuesta exitosa:', {
                retentions_count: retentions.length,
                total_docs: totalDocs,
                totals
            });

            res.status(200).json({
                success: true,
                data: retentions,
                pagination: {
                    totalDocs,
                    totalPages: Math.ceil(totalDocs / limit),
                    page,
                    limit
                },
                totals: totals
            });

        } catch (error) {
            console.error('❌ Error en getSalesBreakdown:', error);
            console.error('Stack:', error.stack);
            res.status(500).json({
                success: false,
                message: 'Error al obtener desglose fiscal',
                error: process.env.NODE_ENV !== 'production' ? error.message : undefined
            });
        }
    },

    /**
     * Exportar a Excel (CSV simple por ahora debido a error de librería)
     */
    exportRetentions: async (req, res) => {
        try {
            const { month, year, instructor_id, instructor_search, status } = req.query;
            let query = {};

            // Validar parámetros antes de crear query
            if (month && year) {
                const parsedMonth = parseInt(month);
                const parsedYear = parseInt(year);

                if (!isNaN(parsedMonth) && !isNaN(parsedYear)) {
                    query.month = parsedMonth;
                    query.year = parsedYear;
                }
            }

            // ✅ Filtro de estado
            if (status && status !== 'all') {
                query.status = status;
            }

            // ✅ BÚSQUEDA POR TEXTO
            if (instructor_search && instructor_search.trim()) {
                const searchRegex = new RegExp(instructor_search.trim(), 'i');
                const matchingInstructors = await models.User.find({
                    $or: [
                        { name: searchRegex },
                        { surname: searchRegex },
                        { email: searchRegex }
                    ]
                }).select('_id');

                const instructorIds = matchingInstructors.map(u => u._id);
                if (instructorIds.length > 0) {
                    query.instructor = { $in: instructorIds };
                } else {
                    // No hay instructores, retornar CSV vacío
                    query.instructor = null;
                }
            }
            // ✅ FILTRO POR ID EXACTO
            else if (instructor_id && mongoose.Types.ObjectId.isValid(instructor_id)) {
                query.instructor = instructor_id;
            }

            const retentions = await models.InstructorRetention.find(query)
                .populate('instructor', 'name surname email');

            // CSV Header
            let csv = "Instructor,Email,ID Venta,Monto Bruto,Retención ISR,Retención IVA,Total Retenido,Pago Neto,Comisión Stripe Payouts,Estado\n";

            retentions.forEach(r => {
                const instructorName = `${r.instructor.name} ${r.instructor.surname}`;
                csv += `"${instructorName}","${r.instructor.email}","${r.sale}","${r.gross_earning.toFixed(2)}","${r.isr_retention.toFixed(2)}","${r.iva_retention.toFixed(2)}","${r.total_retention.toFixed(2)}","${r.net_pay.toFixed(2)}","${r.stripe_send_commission ? r.stripe_send_commission.toFixed(2) : '0.00'}","${r.status}"\n`;
            });

            res.header('Content-Type', 'text/csv');
            res.header('Content-Disposition', `attachment; filename=retenciones_${month}_${year}.csv`);
            res.send(csv);

        } catch (error) {
            console.error('❌ Error al exportar:', error);
            res.status(500).json({ success: false, message: 'Error al exportar' });
        }
    },

    /**
     * Obtener contador de retenciones pendientes
     */
    getPendingCount: async (req, res) => {
        try {
            const pendingCount = await models.InstructorRetention.countDocuments({
                status: 'pending'
            });

            res.status(200).json({
                success: true,
                count: pendingCount
            });
        } catch (error) {
            console.error('Error en getPendingCount:', error);
            res.status(500).json({ success: false, message: 'Error al obtener contador' });
        }
    }
};
