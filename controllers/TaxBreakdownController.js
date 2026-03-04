import models from '../models/index.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDFDocumentPromise = import('pdfkit').catch(() => null);

/**
 * ─────────────────────────────────────────────────────────────
 *  HELPER: Construir query de retenciones con filtros
 * ─────────────────────────────────────────────────────────────
 */
async function buildQuery({ month, year, status, instructor_id, instructor_search, start_date, end_date }) {
    const query = {};

    if (month && year) {
        const m = parseInt(month), y = parseInt(year);
        if (!isNaN(m) && !isNaN(y)) { query.month = m; query.year = y; }
    }

    if (start_date || end_date) {
        query.created_at = {};
        if (start_date) query.created_at.$gte = new Date(start_date);
        if (end_date) {
            const e = new Date(end_date);
            e.setHours(23, 59, 59, 999);
            query.created_at.$lte = e;
        }
    }

    if (status && status !== 'all') query.status = status;

    if (instructor_search?.trim()) {
        const regex = new RegExp(instructor_search.trim(), 'i');
        const users = await models.User.find({
            $or: [{ name: regex }, { surname: regex }, { email: regex }]
        }).select('_id');
        const ids = users.map(u => u._id);
        query.instructor = ids.length ? { $in: ids } : null;
    } else if (instructor_id && mongoose.Types.ObjectId.isValid(instructor_id)) {
        query.instructor = instructor_id;
    }

    return query;
}

/**
 * ─────────────────────────────────────────────────────────────
 *  HELPER: Excluir retenciones de ventas reembolsadas
 * ─────────────────────────────────────────────────────────────
 */
async function filterRefunded(retentions) {
    const Refund = (await import('../models/Refund.js')).default;

    const saleIds = retentions.map(r => r.sale?._id || r.sale).filter(Boolean);
    if (!saleIds.length) return retentions;

    const refundedSaleIds = await Refund.distinct('sale', {
        sale: { $in: saleIds },
        status: { $in: ['approved', 'completed'] }
    });

    const refundedSet = new Set(refundedSaleIds.map(id => id.toString()));
    return retentions.filter(r => {
        const sid = (r.sale?._id || r.sale)?.toString();
        return !refundedSet.has(sid);
    });
}

export default {

    // ─────────────────────────────────────────────────────────────
    //  GET /api/admin/tax-breakdown
    //  Desglose fiscal principal con todos los cálculos correctos
    // ─────────────────────────────────────────────────────────────
    getSalesBreakdown: async (req, res) => {
        try {
            const {
                month, year, instructor_id, instructor_search,
                status, start_date, end_date,
                page = 1, limit = 20
            } = req.query;

            const query = await buildQuery({ month, year, status, instructor_id, instructor_search, start_date, end_date });

            // ── Obtener todas las retenciones para totales ──
            const allRaw = await models.InstructorRetention.find(query)
                .populate('sale', '_id status')
                .lean();

            // ── Excluir reembolsadas ──
            const all = await filterRefunded(allRaw);

            const totalDocs = all.length;

            // ── Calcular totales globales ──
            const saleIds = [...new Set(all.map(r => (r.sale?._id || r.sale)?.toString()).filter(Boolean))];

            const platformBreakdownsAll = saleIds.length
                ? await models.PlatformCommissionBreakdown.find({ sale: { $in: saleIds } }).lean()
                : [];

            const pbMap = new Map(platformBreakdownsAll.map(p => [p.sale.toString(), p]));

            let totals = {
                sales_count: saleIds.length,
                retention_count: all.length,

                // Ventas
                total_sales_volume: 0,          // Total bruto vendido
                total_stripe_receive: 0,         // Comisión Stripe por cobrar
                total_distributable: 0,          // Neto después de Stripe recibir

                // Plataforma
                platform_share: 0,              // Parte plataforma
                platform_stripe_send: 0,        // Comisión Stripe al pagar instructores
                platform_taxes: 0,              // ISR + IVA plataforma
                platform_isr: 0,
                platform_iva: 0,
                platform_net_profit: 0,         // Utilidad neta real

                // Instructor
                instructor_share: 0,            // Parte instructor (bruto)
                instructor_isr: 0,              // ISR retenido a instructores
                instructor_iva: 0,              // IVA retenido a instructores
                instructor_total_retention: 0,  // Total retenido a instructores
                instructor_net_pay: 0,          // Lo que realmente se les paga

                // Por tipo
                by_referral: { count: 0, volume: 0, instructor_net: 0 },
                by_organic: { count: 0, volume: 0, instructor_net: 0 },
            };

            for (const r of all) {
                const sid = (r.sale?._id || r.sale)?.toString();
                const pb = sid ? pbMap.get(sid) : null;

                if (pb) {
                    totals.total_sales_volume += pb.sale_amount || 0;
                    totals.total_stripe_receive += pb.stripe_receive_commission || 0;
                    totals.total_distributable += pb.net_after_stripe_receive || 0;
                    totals.platform_share += pb.platform_share || 0;
                    totals.platform_stripe_send += pb.stripe_send_commission || 0;
                    totals.platform_isr += pb.platform_isr || 0;
                    totals.platform_iva += pb.platform_iva || 0;
                    totals.platform_taxes += (pb.platform_isr || 0) + (pb.platform_iva || 0);
                    totals.platform_net_profit += pb.platform_net_profit || 0;
                    totals.instructor_share += pb.instructor_share || 0;
                }

                totals.instructor_isr += r.isr_retention || 0;
                totals.instructor_iva += r.iva_retention || 0;
                totals.instructor_total_retention += r.total_retention || 0;
                totals.instructor_net_pay += r.net_pay || 0;

                if (r.is_referral) {
                    totals.by_referral.count++;
                    totals.by_referral.volume += pb?.sale_amount || 0;
                    totals.by_referral.instructor_net += r.net_pay || 0;
                } else {
                    totals.by_organic.count++;
                    totals.by_organic.volume += pb?.sale_amount || 0;
                    totals.by_organic.instructor_net += r.net_pay || 0;
                }
            }

            // Redondear totales
            for (const k of Object.keys(totals)) {
                if (typeof totals[k] === 'number') totals[k] = parseFloat(totals[k].toFixed(2));
            }

            // ── Paginación ──
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const paginated = all.slice(skip, skip + parseInt(limit));

            // ── Poblar datos para la tabla ──
            const paginatedIds = paginated.map(r => r._id);
            const populated = await models.InstructorRetention.find({ _id: { $in: paginatedIds } })
                .populate('instructor', 'name surname email avatar')
                .populate('sale', '_id n_transaccion total method_payment createdAt status')
                .populate({ path: 'earning', select: 'product_id product_type sale_price' })
                .sort({ created_at: -1 })
                .lean();

            // Adjuntar platform breakdown a cada fila
            const baseUrl = (process.env.URL_BACKEND || '').replace(/\/$/, '');
            for (const r of populated) {
                const sid = (r.sale?._id || r.sale)?.toString();
                if (sid) r.platform_breakdown = pbMap.get(sid) || null;
                if (r.cfdi_xml) r.cfdi_xml_url = `${baseUrl}/uploads/cfdi/${r.cfdi_xml}`;
                if (r.cfdi_pdf) r.cfdi_pdf_url = `${baseUrl}/uploads/cfdi/${r.cfdi_pdf}`;
            }

            res.json({
                success: true,
                data: populated,
                totals,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalDocs,
                    totalPages: Math.ceil(totalDocs / parseInt(limit))
                }
            });

        } catch (error) {
            console.error('❌ getSalesBreakdown:', error);
            res.status(500).json({ success: false, message: 'Error al obtener desglose fiscal', error: error.message });
        }
    },

    // ─────────────────────────────────────────────────────────────
    //  GET /api/admin/tax-breakdown/export
    //  Exportar CSV completo con todos los campos
    // ─────────────────────────────────────────────────────────────
    exportRetentions: async (req, res) => {
        try {
            const { month, year, instructor_id, instructor_search, status, start_date, end_date } = req.query;
            const query = await buildQuery({ month, year, status, instructor_id, instructor_search, start_date, end_date });

            const allRaw = await models.InstructorRetention.find(query)
                .populate('instructor', 'name surname email')
                .populate('sale', '_id n_transaccion total method_payment createdAt')
                .lean();

            const all = await filterRefunded(allRaw);

            const saleIds = all.map(r => (r.sale?._id || r.sale)).filter(Boolean);
            const pbList = saleIds.length
                ? await models.PlatformCommissionBreakdown.find({ sale: { $in: saleIds } }).lean()
                : [];
            const pbMap = new Map(pbList.map(p => [p.sale.toString(), p]));

            const BOM = '\uFEFF';
            const headers = [
                'Fecha', 'ID Transacción', 'Instructor', 'Email',
                'Tipo', 'Venta Total (MXN)', 'Comisión Stripe Recibir',
                'Neto Distribuible', 'Parte Plataforma', 'Parte Instructor',
                'ISR Instructor', 'IVA Instructor', 'Total Retenido', 'Pago Neto Instructor',
                'ISR Plataforma', 'IVA Plataforma', 'Comisión Stripe Enviar', 'Utilidad Neta Plataforma',
                'Estado', 'UUID CFDI'
            ].join(',');

            const rows = all.map(r => {
                const sid = (r.sale?._id || r.sale)?.toString();
                const pb = sid ? pbMap.get(sid) : null;
                const name = `${r.instructor?.name || ''} ${r.instructor?.surname || ''}`.trim();
                const date = r.sale?.createdAt ? new Date(r.sale.createdAt).toLocaleDateString('es-MX') : '';
                const txn = r.sale?.n_transaccion || sid || '';

                return [
                    date, txn,
                    `"${name}"`, `"${r.instructor?.email || ''}"`,
                    r.is_referral ? 'Referido' : 'Orgánico',
                    (pb?.sale_amount || 0).toFixed(2),
                    (pb?.stripe_receive_commission || 0).toFixed(2),
                    (pb?.net_after_stripe_receive || 0).toFixed(2),
                    (pb?.platform_share || 0).toFixed(2),
                    (pb?.instructor_share || 0).toFixed(2),
                    (r.isr_retention || 0).toFixed(2),
                    (r.iva_retention || 0).toFixed(2),
                    (r.total_retention || 0).toFixed(2),
                    (r.net_pay || 0).toFixed(2),
                    (pb?.platform_isr || 0).toFixed(2),
                    (pb?.platform_iva || 0).toFixed(2),
                    (pb?.stripe_send_commission || 0).toFixed(2),
                    (pb?.platform_net_profit || 0).toFixed(2),
                    r.status || '',
                    r.cfdi_uuid || ''
                ].join(',');
            });

            const csv = BOM + headers + '\n' + rows.join('\n');
            const periodLabel = month && year ? `${month}_${year}` : 'todo';

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=desglose_fiscal_${periodLabel}.csv`);
            res.send(csv);

        } catch (error) {
            console.error('❌ exportRetentions:', error);
            res.status(500).json({ success: false, message: 'Error al exportar' });
        }
    },

    // ─────────────────────────────────────────────────────────────
    //  GET /api/admin/tax-breakdown/summary  (tarjetas KPI rápidas)
    // ─────────────────────────────────────────────────────────────
    getSummary: async (req, res) => {
        try {
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();

            const thisMonthQuery = { month: currentMonth, year: currentYear };
            const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthQuery = { month: lastMonthDate.getMonth() + 1, year: lastMonthDate.getFullYear() };

            const [thisMonthRaw, lastMonthRaw, pendingCount] = await Promise.all([
                models.InstructorRetention.find(thisMonthQuery).lean(),
                models.InstructorRetention.find(lastMonthQuery).lean(),
                models.InstructorRetention.countDocuments({ status: 'pending' })
            ]);

            const thisMonth = await filterRefunded(thisMonthRaw);
            const lastMonth = await filterRefunded(lastMonthRaw);

            const sumNet = arr => arr.reduce((s, r) => s + (r.net_pay || 0), 0);

            res.json({
                success: true,
                summary: {
                    this_month: { count: thisMonth.length, instructor_net: parseFloat(sumNet(thisMonth).toFixed(2)) },
                    last_month: { count: lastMonth.length, instructor_net: parseFloat(sumNet(lastMonth).toFixed(2)) },
                    pending_count: pendingCount
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener resumen' });
        }
    },

    // ─────────────────────────────────────────────────────────────
    //  POST /api/admin/tax-breakdown/cfdi
    // ─────────────────────────────────────────────────────────────
    generateCFDI: async (req, res) => {
        try {
            const { retention_id } = req.body;
            const retention = await models.InstructorRetention.findById(retention_id);
            if (!retention) return res.status(404).json({ message: 'Retención no encontrada' });

            const uuid = crypto.randomUUID();
            retention.cfdi_uuid = uuid;
            retention.declaration_date = new Date();
            retention.status = 'declared';

            const uploadsDir = path.join(__dirname, '..', 'uploads', 'cfdi');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

            const xmlFileName = `cfdi_${retention._id}_${uuid}.xml`;
            const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<CFDI>\n  <UUID>${uuid}</UUID>\n  <Instructor>${retention.instructor}</Instructor>\n  <Periodo>${retention.month}/${retention.year}</Periodo>\n  <Ingresos>${retention.gross_earning.toFixed(2)}</Ingresos>\n  <Retenciones>${retention.total_retention.toFixed(2)}</Retenciones>\n  <Neto>${retention.net_pay.toFixed(2)}</Neto>\n</CFDI>`;
            fs.writeFileSync(path.join(uploadsDir, xmlFileName), xmlContent, 'utf8');

            retention.cfdi_xml = xmlFileName;
            await retention.save();

            const baseUrl = (process.env.URL_BACKEND || '').replace(/\/$/, '');
            res.json({ success: true, cfdi_uuid: uuid, urls: { xml: `${baseUrl}/uploads/cfdi/${xmlFileName}` } });
        } catch (error) {
            console.error('❌ generateCFDI:', error);
            res.status(500).json({ success: false, message: 'Error al generar CFDI' });
        }
    },

    resendCFDI: async (req, res) => {
        try {
            const { retention_id } = req.body;
            const retention = await models.InstructorRetention.findById(retention_id);
            if (!retention) return res.status(404).json({ message: 'Retención no encontrada' });
            if (!retention.cfdi_xml) return res.status(400).json({ success: false, message: 'CFDI no generado aún' });
            const baseUrl = (process.env.URL_BACKEND || '').replace(/\/$/, '');
            res.json({ success: true, urls: { xml: `${baseUrl}/uploads/cfdi/${retention.cfdi_xml}` } });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener CFDI' });
        }
    },

    getPendingCount: async (req, res) => {
        try {
            const count = await models.InstructorRetention.countDocuments({ status: 'pending' });
            res.json({ success: true, count });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error' });
        }
    }
};
