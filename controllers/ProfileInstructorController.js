import models from "../models/index.js";
import resource from "../resource/index.js";
import token from "../service/token.js";
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// Necesitamos __dirname para manejar las rutas de archivos
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    profile: async(req,res) => {
        const backendUrl = process.env.URL_BACKEND || 'http://localhost:3000';
        try {
            const user = await token.decode(req.headers.token);
            const instructor = await models.User.findById(user._id);

            // Aquí puedes añadir más lógica para obtener datos específicos del instructor,
            // como sus cursos creados, ganancias, etc.

            res.status(200).json({
                profile: {
                    name: instructor.name,
                    surname: instructor.surname,
                    email: instructor.email,
                    profession: instructor.profession,
                    description: instructor.description,
                    rol: instructor.rol, // Añadimos el rol a la respuesta
                    avatar: instructor.avatar, // Devolvemos solo el nombre del archivo
                }
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({ message: 'HUBO UN ERROR' });
        }
    },

    update: async(req,res) => {
        const backendUrl = process.env.URL_BACKEND || 'http://localhost:3000';
        try {
            const user = await token.decode(req.headers.token);

            // Validar si el correo electrónico ya está en uso por otro usuario
            if (req.body.email) {
                const existingUser = await models.User.findOne({email: req.body.email, _id: {$ne: user._id}});
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

            const updatedUser = await models.User.findByIdAndUpdate(user._id, req.body, { new: true });

            res.status(200).json({
                message: 'El perfil se actualizó correctamente.',
                user: resource.User.api_resource_user(updatedUser),
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({ message: 'HUBO UN ERROR' });
        }
    },

    update_avatar: async(req,res) => {
        try {
            const backendUrl = process.env.URL_BACKEND || 'http://localhost:3000';
            const user = await token.decode(req.headers.token);

            if(req.files && req.files.avatar){
                // Si se sube una nueva imagen, eliminamos la anterior.
                const oldUser = await models.User.findById(user._id);
                if (oldUser.avatar && fs.existsSync(path.join(__dirname, '../uploads/user/', oldUser.avatar))) {
                    fs.unlinkSync(path.join(__dirname, '../uploads/user/', oldUser.avatar));
                }
                const img_path = req.files.avatar.path;
                const avatar_name = path.basename(img_path);
                
                const updatedUser = await models.User.findByIdAndUpdate(user._id, { avatar: avatar_name }, { new: true });

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