// /api/controllers/SettingController.js
import models from "../models/index.js";

export default {
    // Listar todos los ajustes
    list: async (req, res) => {
        try {
            const settings = await models.Setting.find({});
            res.status(200).json({ settings });
        } catch (error) {
            console.error("Error en SettingController.list:", error);
            res.status(500).send({ message: "Ocurrió un error al listar los ajustes." });
        }
    },

    // Obtener ajustes por grupo
    getByGroup: async (req, res) => {
        try {
            const { group } = req.params;
            const settings = await models.Setting.find({ group });
            res.status(200).json({ settings });
        } catch (error) {
            console.error("Error en SettingController.getByGroup:", error);
            res.status(500).send({ message: "Ocurrió un error al obtener los ajustes del grupo." });
        }
    },

    // Obtener un setting específico por key
    getByKey: async (req, res) => {
        try {
            const { key } = req.params;
            const setting = await models.Setting.findOne({ key });
            
            if (!setting) {
                return res.status(404).json({ message: "Setting no encontrado." });
            }
            
            res.status(200).json({ setting });
        } catch (error) {
            console.error("Error en SettingController.getByKey:", error);
            res.status(500).send({ message: "Ocurrió un error al obtener el ajuste." });
        }
    },

    // Actualizar múltiples settings
    update: async (req, res) => {
        try {
            const settingsToUpdate = req.body.settings;

            if (!Array.isArray(settingsToUpdate)) {
                return res.status(400).send({ 
                    message: "El formato de los datos es incorrecto. Se esperaba un array de ajustes." 
                });
            }

            const updatePromises = settingsToUpdate.map(setting => {
                return models.Setting.findOneAndUpdate(
                    { key: setting.key },
                    { 
                        value: setting.value,
                        name: setting.name || setting.key,
                        description: setting.description || '',
                        group: setting.group || 'general'
                    },
                    { new: true, upsert: true }
                );
            });

            const updatedSettings = await Promise.all(updatePromises);

            res.status(200).json({ 
                message: "Ajustes actualizados correctamente.",
                settings: updatedSettings
            });

        } catch (error) {
            console.error("Error en SettingController.update:", error);
            res.status(500).send({ message: "Ocurrió un error al actualizar los ajustes." });
        }
    },

    // Actualizar un solo setting
    updateOne: async (req, res) => {
        try {
            const { key } = req.params;
            const { value, name, description, group } = req.body;

            const updatedSetting = await models.Setting.findOneAndUpdate(
                { key },
                { 
                    value,
                    ...(name && { name }),
                    ...(description && { description }),
                    ...(group && { group })
                },
                { new: true, upsert: true }
            );

            res.status(200).json({ 
                message: "Ajuste actualizado correctamente.",
                setting: updatedSetting
            });

        } catch (error) {
            console.error("Error en SettingController.updateOne:", error);
            res.status(500).send({ message: "Ocurrió un error al actualizar el ajuste." });
        }
    },

    // Inicializar settings por defecto
    initializeDefaults: async (req, res) => {
        try {
            const defaultSettings = [
                // General
                { key: 'site_name', value: 'NeoCourse', name: 'Nombre del Sitio', group: 'general', description: 'Nombre de tu plataforma' },
                { key: 'site_description', value: 'Plataforma de cursos online', name: 'Descripción', group: 'general', description: 'Descripción breve de tu sitio' },
                { key: 'site_email', value: 'contact@neocourse.com', name: 'Email de Contacto', group: 'general', description: 'Email principal de contacto' },
                { key: 'site_phone', value: '+52 123 456 7890', name: 'Teléfono', group: 'general', description: 'Teléfono de contacto' },
                
                // Comisiones
                { key: 'default_commission', value: 30, name: 'Comisión por Defecto (%)', group: 'commissions', description: 'Porcentaje de comisión que cobra la plataforma' },
                { key: 'min_payout_amount', value: 50, name: 'Monto Mínimo de Pago (USD)', group: 'commissions', description: 'Monto mínimo para realizar un pago a instructores' },
                { key: 'days_to_available', value: 7, name: 'Días hasta Disponible', group: 'commissions', description: 'Días que deben pasar para que una ganancia esté disponible' },
                
                // Pagos
                { key: 'payment_methods', value: ['PayPal', 'Transferencia Bancaria'], name: 'Métodos de Pago', group: 'payments', description: 'Métodos de pago disponibles' },
                { key: 'currency_default', value: 'USD', name: 'Moneda por Defecto', group: 'payments', description: 'Moneda principal de la plataforma' },
                { key: 'tax_rate', value: 16, name: 'Tasa de IVA (%)', group: 'payments', description: 'Porcentaje de IVA aplicable' },
                
                // Email
                { key: 'email_from_name', value: 'NeoCourse', name: 'Nombre del Remitente', group: 'email', description: 'Nombre que aparece en los emails' },
                { key: 'email_from_address', value: 'noreply@neocourse.com', name: 'Email del Remitente', group: 'email', description: 'Email desde donde se envían las notificaciones' },
                { key: 'email_footer', value: '© 2025 NeoCourse. Todos los derechos reservados.', name: 'Footer de Emails', group: 'email', description: 'Texto del pie de página en emails' },
                
                // Legales
                { key: 'terms_url', value: '/terms', name: 'URL Términos y Condiciones', group: 'legal', description: 'URL de términos y condiciones' },
                { key: 'privacy_url', value: '/privacy', name: 'URL Política de Privacidad', group: 'legal', description: 'URL de política de privacidad' },
                { key: 'refund_policy', value: '30 días de garantía', name: 'Política de Reembolso', group: 'legal', description: 'Descripción de la política de reembolso' },
                
                // Features
                { key: 'allow_instructor_register', value: true, name: 'Permitir Registro de Instructores', group: 'features', description: 'Permitir que cualquiera se registre como instructor' },
                { key: 'require_course_approval', value: false, name: 'Requiere Aprobación de Cursos', group: 'features', description: 'Los cursos deben ser aprobados antes de publicarse' },
                { key: 'enable_reviews', value: true, name: 'Habilitar Reviews', group: 'features', description: 'Permitir que los estudiantes dejen reseñas' },
                { key: 'enable_certificates', value: true, name: 'Habilitar Certificados', group: 'features', description: 'Generar certificados al completar cursos' },
            ];

            const promises = defaultSettings.map(setting => 
                models.Setting.findOneAndUpdate(
                    { key: setting.key },
                    setting,
                    { upsert: true, new: true }
                )
            );

            await Promise.all(promises);

            res.status(200).json({ 
                message: "Settings por defecto inicializados correctamente.",
                count: defaultSettings.length
            });

        } catch (error) {
            console.error("Error en SettingController.initializeDefaults:", error);
            res.status(500).send({ message: "Ocurrió un error al inicializar los settings." });
        }
    },

    // Helper para obtener settings (para uso interno)
    getSettings: async () => {
        const settings = await models.Setting.find({});
        return settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});
    },

    // Helper para obtener un setting específico (para uso interno)
    getSetting: async (key, defaultValue = null) => {
        const setting = await models.Setting.findOne({ key });
        return setting ? setting.value : defaultValue;
    }
}
