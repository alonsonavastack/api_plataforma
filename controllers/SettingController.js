import models from "../models/index.js";

export default {
    list: async (req, res) => {
        try {
            // Devuelve todos los ajustes, útil para el panel de admin
            const settings = await models.Setting.find({});
            res.status(200).json({ settings });
        } catch (error) {
            console.error("Error en SettingController.list:", error);
            res.status(500).send({ message: "Ocurrió un error al listar los ajustes." });
        }
    },

    update: async (req, res) => {
        try {
            // Recibe un array de ajustes para actualizar
            const settingsToUpdate = req.body.settings;

            if (!Array.isArray(settingsToUpdate)) {
                return res.status(400).send({ message: "El formato de los datos es incorrecto. Se esperaba un array de ajustes." });
            }

            const updatePromises = settingsToUpdate.map(setting => {
                return models.Setting.findOneAndUpdate(
                    { key: setting.key },
                    { value: setting.value },
                    { new: true, upsert: true } // `upsert: true` crea el ajuste si no existe
                );
            });

            await Promise.all(updatePromises);

            res.status(200).json({ message: "Ajustes actualizados correctamente." });

        } catch (error) {
            console.error("Error en SettingController.update:", error);
            res.status(500).send({ message: "Ocurrió un error al actualizar los ajustes." });
        }
    },

    // Un helper para obtener los ajustes en otros controladores
    getSettings: async () => {
        const settings = await models.Setting.find({});
        // Convertir el array de ajustes en un objeto clave-valor para fácil acceso
        return settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});
    }
}