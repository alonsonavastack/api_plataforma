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
                if (data.mercadopago) settings.mercadopago = { ...settings.mercadopago, ...data.mercadopago };
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
            const publicSettings = {
                paypal: {
                    active: settings.paypal.active,
                    clientId: settings.paypal.clientId, // Necesario para el frontend
                    instructorPayoutsActive: settings.paypal.instructorPayoutsActive, // 🆕 Visible para instructores
                    mode: settings.paypal.mode
                },
                mercadopago: {
                    active: settings.mercadopago.active,
                    publicKey: settings.mercadopago.publicKey, // Necesario para el frontend
                    instructorPayoutsActive: settings.mercadopago.instructorPayoutsActive // 🆕 Visible para instructores
                }
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
