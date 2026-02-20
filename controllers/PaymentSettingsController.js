import PaymentSettings from '../models/PaymentSettings.js';

/**
 * Obtiene el documento único de configuración de pagos.
 * NUNCA crea más de un documento.
 */
const getOrCreate = async () => {
    // 🔥 FIX CRÍTICO: Usar findOneAndUpdate con upsert vacío para garantizar UN ÚNICO documento
    // y evitar que cree múltiples documentos si findOne() devuelve null por errores de validación
    let settings = await PaymentSettings.findOne();

    if (!settings) {
        // En lugar de usar .create(), buscamos e insertamos atómicamente si no hay ninguno.
        // Si hay documentos corruptos (ej. puros de paypal), findOneAndUpdate tomará el primero.
        settings = await PaymentSettings.findOneAndUpdate(
            {},
            {
                $setOnInsert: {
                    stripe: { mode: 'test', active: true, secretKey: '', publishableKey: '', webhookSecret: '' }
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        console.log('✅ [PaymentSettings] Documento inicializado o recuperado atómicamente:', settings._id);
    }

    // Documento legacy sin campo stripe — inyectarlo con $set directo en MongoDB
    if (settings && !settings.stripe) {
        settings = await PaymentSettings.findByIdAndUpdate(
            settings._id,
            { $set: { stripe: { mode: 'test', active: true, secretKey: '', publishableKey: '', webhookSecret: '' } } },
            { new: true }
        );
        console.log('🔧 [PaymentSettings] Campo stripe inyectado en documento legacy');
    }

    return settings;
};

export default {
    // ─── Admin: leer configuración completa ─────────────────────────────────
    getSettings: async (req, res) => {
        try {
            const settings = await getOrCreate();
            console.log('📤 [PaymentSettings] GET stripe:', JSON.stringify(settings.stripe, null, 2));
            res.status(200).json({ settings });
        } catch (error) {
            console.error('❌ [PaymentSettings] getSettings:', error);
            res.status(500).send({ message: 'OCURRIÓ UN PROBLEMA' });
        }
    },

    // ─── Admin: guardar configuración ───────────────────────────────────────
    updateSettings: async (req, res) => {
        try {
            const data = req.body;
            console.log('📥 [PaymentSettings] PUT recibido:', JSON.stringify(data, null, 2));

            const settings = await getOrCreate();

            if (data.stripe) {
                // Ensure stripe exists
                if (!settings.stripe) settings.stripe = {};

                // Update properties individually to avoid casting errors from legacy subdocuments
                const fields = ['mode', 'active', 'secretKey', 'publishableKey', 'webhookSecret'];
                fields.forEach(field => {
                    if (data.stripe[field] !== undefined && data.stripe[field] !== null) {
                        settings.stripe[field] = data.stripe[field];
                    }
                });

                // Force mongoose to recognize changes in mixed/nested paths
                settings.markModified('stripe');
            }

            // Important: Explicitly remove paypal if it exists to clean DB schema natively over time
            if (settings.paypal !== undefined) {
                settings.paypal = undefined;
            }

            settings.updatedBy = req.user._id;
            const saved = await settings.save();
            console.log('✅ [PaymentSettings] Guardado:', JSON.stringify(saved.stripe, null, 2));

            res.status(200).json({ message: 'Configuración actualizada correctamente', settings: saved });
        } catch (error) {
            console.error('❌ [PaymentSettings] updateSettings error detallado:', error);
            res.status(500).send({
                message: 'Error al actualizar configuración de pago',
                details: error.message
            });
        }
    },

    // ─── Público: solo datos seguros para el checkout ───────────────────────
    // ⚠️ NUNCA crear documentos aquí — solo leer
    getPublicSettings: async (req, res) => {
        try {
            const settings = await PaymentSettings.findOne().lean();
            res.status(200).json({
                settings: {
                    stripe: {
                        active: settings?.stripe?.active !== false,
                        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || settings?.stripe?.publishableKey || '',
                        mode: process.env.STRIPE_MODE || settings?.stripe?.mode || 'test'
                    }
                }
            });
        } catch (error) {
            console.error('❌ [PaymentSettings] getPublicSettings:', error);
            res.status(500).send({ message: 'OCURRIÓ UN PROBLEMA' });
        }
    }
};
