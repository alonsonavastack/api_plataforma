import models from "../models/index.js";
import bcrypt from "bcryptjs";
import token from "../service/token.js";
import resource from "../resource/index.js";

import fs from "fs";
import path from "path";

export default {
  register: async (req, res) => {
    try {
      const VALID_USER = await models.User.findOne({ email: req.body.email });

      if (VALID_USER) {
        res.status(200).json({
          message: 403,
          message_text: "EL USUARIO INGRESADO YA EXISTE",
        });
      }

      // ENCRIPTACIÓN DE CONTRASEÑA 12345678 -> fhjsdhf34j534jbj34bf34
      req.body.password = await bcrypt.hash(req.body.password, 10);

      // const newUser = new models.User();
      // newUser.rol = req.body.role
      // newUser.name = req.body.nombre
      // newUser.surname = req.body.apellido
      // newUser.email = req.body.correo
      // newUser.password = req.body.contraseña
      // newUser.save();

      const User = await models.User.create(req.body);
      res.status(200).json({
        user: resource.User.api_resource_user(User),
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },
  register_admin: async (req, res) => {
    try {
      const VALID_USER = await models.User.findOne({ email: req.body.email });

      if (VALID_USER) {
        res.status(200).json({
          message: 403,
          message_text: "EL USUARIO INGRESADO YA EXISTE",
        });
      }

      req.body.password = await bcrypt.hash(req.body.password, 10);
      if (req.files && req.files.avatar) {
        const img_path = req.files.avatar.path;
        const avatar_name = path.basename(img_path);
        req.body.avatar = avatar_name;
      }
      const User = await models.User.create(req.body);
      res.status(200).json({
        user: resource.User.api_resource_user(User),
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },
  update: async (req, res) => {
    try {
      // echo@gmail.com
      const VALID_USER = await models.User.findOne({
        email: req.body.email,
        _id: { $ne: req.body._id },
      });

      if (VALID_USER) {
        res.status(200).json({
          message: 403,
          message_text: "EL USUARIO INGRESADO YA EXISTE",
        });
      }

      if (req.body.password) {
        req.body.password = await bcrypt.hash(req.body.password, 10);
      }

      if (req.files && req.files.avatar) {
        // Si se sube una nueva imagen, eliminamos la anterior.
        const oldUser = await models.User.findById(req.body._id);
        if (
          oldUser.avatar &&
          fs.existsSync(
            path.join(__dirname, "../uploads/user/", oldUser.avatar)
          )
        ) {
          fs.unlinkSync(
            path.join(__dirname, "../uploads/user/", oldUser.avatar)
          );
        }
        const img_path = req.files.avatar.path;
        const avatar_name = path.basename(img_path);
        req.body.avatar = avatar_name;
      }

      const NUser = await models.User.findByIdAndUpdate(
        { _id: req.body._id },
        req.body,
        {
          new: true, // Devuelve el documento actualizado
        }
      );

      res.status(200).json({
        message: "EL USUARIO SE EDITO CORRECTAMENTE",
        user: resource.User.api_resource_user(NUser),
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },
  update_state: async (req, res) => {
    try {
      const userId = req.params.id;
      const { state } = req.body;

      console.log('=== update_state called ===');
      console.log('userId:', userId);
      console.log('state received:', state, 'type:', typeof state);

      // Validar que el estado sea booleano
      if (typeof state !== 'boolean') {
        console.log('Error: state is not boolean');
        return res.status(400).json({
          message: 400,
          message_text: "El estado debe ser un valor booleano",
        });
      }

      // Buscar el usuario
      console.log('Searching for user...');
      const user = await models.User.findById(userId);
      if (!user) {
        console.log('Error: User not found');
        return res.status(404).json({
          message: 404,
          message_text: "Usuario no encontrado",
        });
      }

      console.log('User found:', user.name, user.email);
      console.log('Current state:', user.state);
      console.log('New state value:', state);

      // Actualizar solo el estado (usando boolean directamente)
      const updatedUser = await models.User.findByIdAndUpdate(
        userId,
        { state: state }, // true = activo, false = inactivo
        { new: true }
      );

      console.log('User updated successfully');
      console.log('Updated state:', updatedUser.state);

      res.status(200).json({
        message: "Estado del usuario actualizado correctamente",
        user: resource.User.api_resource_user(updatedUser),
      });
    } catch (error) {
      console.error('=== ERROR in update_state ===');
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
        error: error.message, // Añadimos el mensaje de error para debug
      });
    }
  },
  list: async (req, res) => {
    try {
      // jose
      // localhost:3000?search=JOSE( JosE)
      const search = req.query.search;
      const rol = req.query.rol;
      const filter = {};

      if (search) {
        filter.$or = [
          { name: new RegExp(search, "i") },
          { surname: new RegExp(search, "i") },
          { email: new RegExp(search, "i") },
        ];
      }
      if (rol) {
        filter.rol = rol;
      }
      filter.rol = { $in: ["admin", "instructor", ...(rol ? [rol] : [])] };
      const USERS = await models.User.find(filter).sort({ createdAt: -1 });

      const usersFormatted = USERS.map((user) =>
        resource.User.api_resource_user(user)
      );
      res.status(200).json({
        users: usersFormatted,
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },
  remove: async (req, res) => {
    try {
      const _id = req.params["id"];
      const User = await models.User.findById({ _id: _id });

      if (!User) {
        return res.status(404).json({ message: "El usuario no existe." });
      }

      if (User.rol === "instructor") {
        const courseCount = await models.Course.countDocuments({ user: _id });
        if (courseCount > 0) {
          return res
            .status(200)
            .json({
              message: 403,
              message_text:
                "No se puede eliminar el instructor porque tiene cursos asignados.",
            });
        }
      }

      if (User.avatar) {
        const imagePath = path.join(__dirname, "../uploads/user/", User.avatar);
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      }

      await models.User.findByIdAndDelete(_id);
      res.status(200).json({
        message: "EL USUARIO SE ELIMINO CORRECTAMENTE",
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },
  get_imagen: async (req, res) => {
    try {
      const img = req.params["img"];
      if (!img) {
        res.status(500).send({
          message: "OCURRIO UN PROBLEMA",
        });
      } else {
        fs.stat("./uploads/user/" + img, function (err) {
          let path_img;
          if (!err) {
            path_img = "./uploads/user/" + img;
            res.status(200).sendFile(path.resolve(path_img));
          } else {
            path_img = "./uploads/default.jpg";
            res.status(200).sendFile(path.resolve(path_img));
          }
        });
      }
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },
  profile: async (req, res) => {
    try {
      // El token es decodificado por el middleware 'auth', que añade 'user' a 'req'
      // Si no hay req.user, el middleware ya habría devuelto un error.
      const user_profile = await models.User.findById(req.user._id);
      if (!user_profile) {
        return res.status(404).send({ message: "Usuario no encontrado." });
      }

      res.status(200).json({
        user: { _id: user_profile._id, rol: user_profile.rol },
        profile: resource.User.api_resource_user(user_profile),
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "HUBO UN ERROR",
      });
    }
  },

  login_general: async (req, res) => {
    try {
      const user = await models.User.findOne({
        email: req.body.email,
        state: 1,
      });
      if (!user) {
        return res.status(401).json({
          message: "El correo o la contraseña son incorrectos.",
        });
      }

      const match = await bcrypt.compare(req.body.password, user.password);
      if (!match) {
        return res.status(401).json({
          message: "El correo o la contraseña son incorrectos.",
        });
      }

      const tokenReturn = await token.encode(user._id, user.rol, user.email);
      // Ajustamos la respuesta para que sea consistente con el resto de la aplicación,
      // separando el usuario base del perfil detallado.
      res.status(200).json({
        USER: {
          token: tokenReturn,
          user: { _id: user._id, rol: user.rol },
          profile: resource.User.api_resource_user(user),
        },
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "Ocurrió un error en el servidor." });
    }
  },
};