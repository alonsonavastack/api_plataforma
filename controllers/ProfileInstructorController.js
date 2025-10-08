import models from "../models/index.js";
import resource from "../resource/index.js";
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    profile: async(req,res) => {
        const backendUrl = process.env.URL_BACKEND || 'http://localhost:3000';
            // The user ID should be available from the auth middleware via `req.user`
            if (!req.user) {
                return res.status(401).send({ message: 'No autenticado.' });
            }
            const instructor = await models.User.findById(req.user._id);

            if (!instructor) {
                return res.status(404).send({ message: 'Instructor no encontrado.' });
            }

            res.status(200).json({
                profile: resource.User.api_resource_user(instructor)
            });
    },

    update: async(req,res) => {
        try {
            // The user ID should be available from the auth middleware via `req.user`
            if (!req.user) {
                return res.status(401).send({ message: 'No autenticado.' });
            }

            // Validar si el correo electrónico ya está en uso por otro usuario
            if (req.body.email) {
                const existingUser = await models.User.findOne({email: req.body.email, _id: {$ne: req.user._id}});
                if(existingUser){
                    return res.status(200).json({
                        message: 403,
                        message_text: "El correo electrónico ya está en uso.",
                    });
                }
            }

            // Si se está cambiando la contraseña, encriptarla
            if(req.body.password){
                req.body.password = await bcrypt.hash(req.body.password, 10);
            }

            const updatedUser = await models.User.findByIdAndUpdate(req.user._id, req.body, { new: true });

            res.status(200).json({
                message: 'El perfil se actualizó correctamente.',
                user: resource.User.api_resource_user(updatedUser),
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({ message: 'HUBO UN ERROR' });
        }
    },

    update_password: async(req,res) => {
        try {
            if (!req.user) {
                return res.status(401).send({ message: 'No autenticado.' });
            }

            const { currentPassword, newPassword } = req.body;

            const user = await models.User.findById(req.user._id);
            if (!user) {
                return res.status(404).send({ message: 'Usuario no encontrado.' });
            }

            const match = await bcrypt.compare(currentPassword, user.password);
            if (!match) {
                return res.status(400).json({ message_text: 'La contraseña actual es incorrecta.' });
            }

            const hashedNewPassword = await bcrypt.hash(newPassword, 10);
            await models.User.findByIdAndUpdate(req.user._id, { password: hashedNewPassword });

            res.status(200).json({
                message: 'La contraseña se actualizó correctamente.',
            });

        } catch (error) {
            console.log(error);
            res.status(500).send({ message: 'HUBO UN ERROR' });
        }
    },

    update_avatar: async(req,res) => {
        try {
            // The user ID should be available from the auth middleware via `req.user`
            if (!req.user) {
                return res.status(401).send({ message: 'No autenticado.' });
            }

            if(req.files && req.files.avatar){
                // Si se sube una nueva imagen, eliminamos la anterior.
                const oldUser = await models.User.findById(req.user._id);
                if (oldUser.avatar && fs.existsSync(path.join(__dirname, '../uploads/user/', oldUser.avatar))) {
                    fs.unlinkSync(path.join(__dirname, '../uploads/user/', oldUser.avatar));
                }
                const img_path = req.files.avatar.path;
                const avatar_name = path.basename(img_path);
                
                const updatedUser = await models.User.findByIdAndUpdate(req.user._id, { avatar: avatar_name }, { new: true });

                res.status(200).json({
                    message: 'El avatar se actualizó correctamente.',
                    user: resource.User.api_resource_user(updatedUser), // El resource ya devuelve el nombre del archivo
                });
            }
        } catch (error) {
            console.log(error);
            res.status(500).send({ message: 'HUBO UN ERROR' });
        }
    }
}