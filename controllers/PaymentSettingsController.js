import PaymentSettings from '../models/PaymentSettings.js';

export default {
    getSettings: async (req, res) => {
        try {
            let settings = await PaymentSettings.findOne();
            if (!settings) {
                settings = await PaymentSettings.create({});
            }
            res.status(200).json({ settings });
        } catch (error) {
            res.status(500).send({
                message: 'OCURRIÓ UN PROBLEMA'
            });
            console.log(error);
        }
    },

    updateSettings: async (req, res) => {
        try {
            const data = req.body;
            let settings = await PaymentSettings.findOne();

            if (!settings) {
                settings = new PaymentSettings(data);
                settings.updatedBy = req.user._id; // Asumiendo que tenemos req.user desde el middleware de auth
                await settings.save();
            } else {
                if (data.paypal) settings.paypal = { ...settings.paypal, ...data.paypal };

                settings.updatedBy = req.user._id;
                await settings.save();
            }

            res.status(200).json({
                message: 'Configuración actualizada correctamente',
                settings
            });
        } catch (error) {
            res.status(500).send({
                message: 'OCURRIÓ UN PROBLEMA'
            });
            console.log(error);
        }
    },

    getPublicSettings: async (req, res) => {
        try {
            let settings = await PaymentSettings.findOne();
            if (!settings) {
                settings = await PaymentSettings.create({});
            }

            // Solo devolver información pública y segura
            // Solo devolver información pública y segura
            // 🔥 FIX: Priorizar variables de entorno
            const envMode = process.env.PAYPAL_MODE;
            const dbMode = settings.paypal.mode;
            const finalMode = (envMode === 'sandbox' || envMode === 'live') ? envMode : dbMode;

            let finalClientId = '';
            if (process.env.PAYPAL_CLIENT_ID) {
                finalClientId = process.env.PAYPAL_CLIENT_ID;
            } else {
                finalClientId = finalMode === 'live'
                    ? settings.paypal.live?.clientId
                    : settings.paypal.sandbox?.clientId;
            }

            const publicSettings = {
                paypal: {
                    active: settings.paypal.active,
                    clientId: finalClientId,
                    instructorPayoutsActive: settings.paypal.instructorPayoutsActive,
                    mode: finalMode
                },

            };

            res.status(200).json({ settings: publicSettings });
        } catch (error) {
            res.status(500).send({
                message: 'OCURRIÓ UN PROBLEMA'
            });
            console.log(error);
        }
    }
}
