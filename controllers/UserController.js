import models from "../models/index.js";
import bcrypt from "bcryptjs";
import token from "../service/token.js";
import resource from "../resource/index.js";
import { sendOtpCode, sendRecoveryOtp, notifyNewRegistration, notifySuccessfulVerification } from "../helpers/telegram.js";

import fs from "fs";
import path from "path";

// Necesitamos __dirname para manejar las rutas de archivos
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  register: async (req, res) => {
    try {
      const VALID_USER = await models.User.findOne({ email: req.body.email });

      if (VALID_USER) {
        return res.status(200).json({
          message: 403,
          message_text: "EL USUARIO INGRESADO YA EXISTE",
        });
      }

      // Validar que el teléfono esté en formato E.164 (sin '+')
      if (!req.body.phone || req.body.phone.length < 10) {
        return res.status(400).json({
          message: 400,
          message_text: "El teléfono es requerido y debe estar en formato E.164 (ej: 52155XXXXXXX)",
        });
      }

      // ✅ FIX: Manejar código de país 'INTL' inválido
      // Si el frontend envía 'INTL', lo tratamos como si no se hubiera seleccionado país.
      if (req.body.country === 'INTL') {
        delete req.body.country; // O req.body.country = null;
      }

      // ENCRIPTACIÓN DE CONTRASEÑA
      req.body.password = await bcrypt.hash(req.body.password, 10);

      // Generar código OTP de 6 dígitos
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

      // Agregar datos de OTP al usuario
      req.body.isVerified = false;
      req.body.otp = {
        code: otpCode,
        expiresAt: otpExpiration,
        attempts: 0,
        resends: 0,
        lastResendAt: new Date()
      };

      const User = await models.User.create(req.body);

      // Enviar OTP por Telegram
      try {
        console.log(`📤 Intentando enviar OTP a Telegram para ${req.body.name}...`);
        const telegramResponse = await sendOtpCode({ 
          code: otpCode, 
          phone: req.body.phone, 
          userName: req.body.name 
        });
        console.log(`✅ OTP enviado exitosamente a Telegram:`, telegramResponse);
        console.log(`   📱 Teléfono: ${req.body.phone}`);
        console.log(`   🔢 Código: ${otpCode}`);

      } catch (telegramError) {
        console.error('❌ Error enviando OTP a Telegram:', {
          message: telegramError.message,
          stack: telegramError.stack,
          telefono: req.body.phone,
          codigo: otpCode
        });
        // No bloqueamos el registro, pero informamos al usuario
        return res.status(200).json({
          message: 'Usuario registrado pero hubo un error al enviar el código. Contacta soporte.',
          user: resource.User.api_resource_user(User),
          otpSent: false
        });
      }

      // Notificar a administradores sobre nuevo registro (operación secundaria)
      try {
        await notifyNewRegistration(User);
      } catch (telegramError) {
        console.error('❌ Error enviando Telegram:', {
          message: telegramError.message,
          stack: telegramError.stack,
          telefono: req.body.phone,
          codigo: otpCode
        });
        // No bloqueamos el registro, pero informamos al usuario
        return res.status(200).json({
          message: 'Usuario registrado pero hubo un error al enviar el código. Contacta soporte.',
          user: resource.User.api_resource_user(User),
          otpSent: false
        });
      }

      res.status(200).json({
        message: 'Usuario registrado. Revisa tu Telegram para verificar tu cuenta.',
        user: resource.User.api_resource_user(User),
        otpSent: true,
        expiresIn: 600 // segundos
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

      // ✅ FIX: Manejar código de país 'INTL' inválido también en el registro de admin
      if (req.body.country === 'INTL') {
        delete req.body.country;
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
      // El ID del usuario a actualizar puede venir del body (gestión de usuarios) o del token (auto-gestión)
      const userIdToUpdate = req.body._id || req.user._id;
      if (!userIdToUpdate) {
        return res.status(400).send({ message: 'No se especificó un ID de usuario.' });
      }

      const VALID_USER = await models.User.findOne({
        email: req.body.email,
        _id: { $ne: userIdToUpdate },
      });

      if (VALID_USER) {
        return res.status(200).json({
          message: 403,
          message_text: "EL USUARIO INGRESADO YA EXISTE",
        });
      }

      // ✅ FIX: Manejar código de país 'INTL' inválido también en la actualización
      // Si el frontend envía 'INTL', lo tratamos como si no se hubiera seleccionado país.
      if (req.body.country === 'INTL') {
        delete req.body.country; // O req.body.country = null;
      }

      // 🔥 MAPEAR REDES SOCIALES DESDE CAMPOS PLANOS A socialMedia
      if (req.body.facebook || req.body.instagram || req.body.youtube || 
          req.body.tiktok || req.body.twitch || req.body.website ||
          req.body.discord || req.body.linkedin || req.body.twitter || req.body.github) {
        req.body.socialMedia = {
          facebook: req.body.facebook || '',
          instagram: req.body.instagram || '',
          youtube: req.body.youtube || '',
          tiktok: req.body.tiktok || '',
          twitch: req.body.twitch || '',
          website: req.body.website || '',
          discord: req.body.discord || '',
          linkedin: req.body.linkedin || '',
          twitter: req.body.twitter || '',
          github: req.body.github || '',
        };
        // Limpiar campos planos
        delete req.body.facebook;
        delete req.body.instagram;
        delete req.body.youtube;
        delete req.body.tiktok;
        delete req.body.twitch;
        delete req.body.website;
        delete req.body.discord;
        delete req.body.linkedin;
        delete req.body.twitter;
        delete req.body.github;
      }

      // No permitir que un usuario se cambie el rol a sí mismo
      if (req.body.password) {
        req.body.password = await bcrypt.hash(req.body.password, 10);
      }

      if (req.files && req.files.avatar) {
        // Si se sube una nueva imagen, eliminamos la anterior.
        const oldUser = await models.User.findById(userIdToUpdate);
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

      const updatedUser = await models.User.findByIdAndUpdate(
        userIdToUpdate,
        req.body,
        {
          new: true, // Devuelve el documento actualizado
        }
      );

      res.status(200).json({
        message: "EL USUARIO SE EDITO CORRECTAMENTE",
        user: resource.User.api_resource_user(updatedUser),
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
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
          if (!req.user) {
              return res.status(401).send({ message: 'No autenticado.' });
          }

          // Usar siempre el ID del usuario autenticado para la actualización de su propio avatar.
          const userIdToUpdate = req.user._id;

          if(req.files && req.files.avatar){
              const oldUser = await models.User.findById(userIdToUpdate);
              if (oldUser.avatar && fs.existsSync(path.join(__dirname, '../uploads/user/', oldUser.avatar))) {
                  fs.unlinkSync(path.join(__dirname, '../uploads/user/', oldUser.avatar));
              }
              const img_path = req.files.avatar.path;
              const avatar_name = path.basename(img_path);
              
              const updatedUser = await models.User.findByIdAndUpdate(userIdToUpdate, { avatar: avatar_name }, { new: true });

              res.status(200).json({
                  message: 'El avatar se actualizó correctamente.',
                  user: resource.User.api_resource_user(updatedUser),
              });
          } else {
            return res.status(400).send({ message: 'No se proporcionó ningún archivo de avatar.' });
          }
      } catch (error) {
          console.log(error);
          res.status(500).send({ message: 'HUBO UN ERROR' });
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
        state: true,
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

      // Verificar si el usuario necesita verificación OTP
      if (!user.isVerified) {
        return res.status(403).json({
          message: 403,
          message_text: "Debes verificar tu cuenta antes de iniciar sesión. Revisa tu Telegram.",
          requiresVerification: true,
          userId: user._id
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

  // =====================================================
  // MÉTODOS DE VERIFICACIÓN OTP
  // =====================================================

  // Verificar código OTP
  verify_otp: async (req, res) => {
    try {
      const { userId, code } = req.body;

      if (!userId || !code) {
        return res.status(400).json({
          message: 400,
          message_text: "Usuario y código son requeridos",
        });
      }

      const user = await models.User.findById(userId);
      if (!user) {
        return res.status(404).json({
          message: 404,
          message_text: "Usuario no encontrado",
        });
      }

      // Verificar si ya está verificado
      if (user.isVerified) {
        return res.status(200).json({
          message: "Tu cuenta ya está verificada",
          alreadyVerified: true
        });
      }

      // Verificar si tiene OTP
      if (!user.otp || !user.otp.code) {
        return res.status(400).json({
          message: 400,
          message_text: "No hay código pendiente. Solicita uno nuevo.",
        });
      }

      // Verificar intentos
      if (user.otp.attempts >= 3) {
        return res.status(403).json({
          message: 403,
          message_text: "Has excedido el número de intentos. Solicita un nuevo código.",
        });
      }

      // Verificar expiración
      if (new Date() > user.otp.expiresAt) {
        return res.status(410).json({
          message: 410,
          message_text: "El código ha expirado. Solicita uno nuevo.",
        });
      }

      // Verificar código
      if (user.otp.code !== code) {
        // Incrementar intentos
        user.otp.attempts += 1;
        await user.save();

        return res.status(400).json({
          message: 400,
          message_text: `Código incorrecto. Te quedan ${3 - user.otp.attempts} intentos.`,
          attemptsRemaining: 3 - user.otp.attempts
        });
      }

      // ¡Código correcto! Verificar cuenta
      user.isVerified = true;
      user.otp = undefined; // Limpiar OTP
      await user.save();

      // Generar token JWT
      const tokenReturn = await token.encode(user._id, user.rol, user.email);

      console.log(`✅ Usuario verificado exitosamente: ${user.email}`);
      
      // Notificar a administradores sobre verificación exitosa
      await notifySuccessfulVerification(user);

      res.status(200).json({
        message: "¡Cuenta verificada exitosamente!",
        USER: {
          token: tokenReturn,
          user: { _id: user._id, rol: user.rol },
          profile: resource.User.api_resource_user(user),
        },
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },

  // Reenviar código OTP
  resend_otp: async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          message: 400,
          message_text: "El ID del usuario es requerido",
        });
      }

      const user = await models.User.findById(userId);
      if (!user) {
        return res.status(404).json({
          message: 404,
          message_text: "Usuario no encontrado",
        });
      }

      // Verificar si ya está verificado
      if (user.isVerified) {
        return res.status(200).json({
          message: "Tu cuenta ya está verificada",
          alreadyVerified: true
        });
      }

      // Verificar límite de reenvíos diarios (5 por día)
      if (user.otp && user.otp.resends >= 5) {
        const lastResend = new Date(user.otp.lastResendAt);
        const now = new Date();
        const hoursSinceLastResend = (now - lastResend) / (1000 * 60 * 60);
        
        if (hoursSinceLastResend < 24) {
          return res.status(429).json({
            message: 429,
            message_text: "Has alcanzado el límite de reenvíos por hoy. Inténtalo mañana.",
          });
        }
      }

      // Rate limiting: no permitir reenvíos antes de 60 segundos
      if (user.otp && user.otp.lastResendAt) {
        const secondsSinceLastResend = (new Date() - new Date(user.otp.lastResendAt)) / 1000;
        if (secondsSinceLastResend < 60) {
          return res.status(429).json({
            message: 429,
            message_text: `Debes esperar ${Math.ceil(60 - secondsSinceLastResend)} segundos antes de reenviar.`,
            waitSeconds: Math.ceil(60 - secondsSinceLastResend)
          });
        }
      }

      // Generar nuevo código OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

      // Actualizar OTP
      user.otp = {
        code: otpCode,
        expiresAt: otpExpiration,
        attempts: 0,
        resends: (user.otp?.resends || 0) + 1,
        lastResendAt: new Date()
      };

      await user.save();

      // Enviar nuevo OTP por Telegram
      try {
        await sendOtpCode({ 
          code: otpCode, 
          phone: user.phone, 
          userName: user.name 
        });
        console.log(`✅ OTP reenviado a Telegram para ${user.name}: ${otpCode}`);
      } catch (telegramError) {
        console.error('❌ Error reenviando Telegram:', telegramError);
        return res.status(500).json({
          message: "Error al enviar el código. Inténtalo de nuevo.",
        });
      }

      res.status(200).json({
        message: "Código reenviado exitosamente. Revisa tu Telegram.",
        expiresIn: 600, // segundos
        resendsRemaining: 5 - user.otp.resends
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },

  // =====================================================
  // MÉTODOS DE RECUPERACIÓN DE CONTRASEÑA
  // =====================================================

  // Solicitar recuperación de contraseña
  request_password_recovery: async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          message: 400,
          message_text: "El email es requerido",
        });
      }

      const user = await models.User.findOne({ email: email });
      if (!user) {
        return res.status(404).json({
          message: 404,
          message_text: "No se encontró un usuario con ese email",
        });
      }

      // Verificar que el usuario esté verificado
      if (!user.isVerified) {
        return res.status(403).json({
          message: 403,
          message_text: "Debes verificar tu cuenta antes de recuperar la contraseña",
        });
      }

      // Verificar que tenga teléfono
      if (!user.phone) {
        return res.status(400).json({
          message: 400,
          message_text: "No tienes un teléfono registrado para recuperar la contraseña",
        });
      }

      // Generar código OTP de recuperación
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

      // Guardar OTP de recuperación
      user.passwordRecoveryOtp = {
        code: otpCode,
        expiresAt: otpExpiration,
        attempts: 0,
        resends: 0,
        lastResendAt: new Date()
      };

      await user.save();

      // Enviar OTP de recuperación por Telegram
      try {
        await sendRecoveryOtp({ 
          code: otpCode, 
          phone: user.phone, 
          userName: user.name 
        });
        console.log(`✅ OTP de recuperación enviado a Telegram para ${user.name}: ${otpCode}`);
      } catch (telegramError) {
        console.error('❌ Error enviando OTP de recuperación:', telegramError);
        return res.status(500).json({
          message: "Error al enviar el código de recuperación. Inténtalo de nuevo.",
        });
      }

      res.status(200).json({
        message: "Código de recuperación enviado. Revisa tu Telegram.",
        expiresIn: 600 // segundos
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },

  // Verificar código OTP de recuperación
  verify_recovery_otp: async (req, res) => {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({
          message: 400,
          message_text: "Email y código son requeridos",
        });
      }

      const user = await models.User.findOne({ email: email });
      if (!user) {
        return res.status(404).json({
          message: 404,
          message_text: "Usuario no encontrado",
        });
      }

      // Verificar si tiene OTP de recuperación
      if (!user.passwordRecoveryOtp || !user.passwordRecoveryOtp.code) {
        return res.status(400).json({
          message: 400,
          message_text: "No hay código de recuperación pendiente. Solicita uno nuevo.",
        });
      }

      // Verificar intentos
      if (user.passwordRecoveryOtp.attempts >= 3) {
        return res.status(403).json({
          message: 403,
          message_text: "Has excedido el número de intentos. Solicita un nuevo código.",
        });
      }

      // Verificar expiración
      if (new Date() > user.passwordRecoveryOtp.expiresAt) {
        return res.status(410).json({
          message: 410,
          message_text: "El código ha expirado. Solicita uno nuevo.",
        });
      }

      // Verificar código
      if (user.passwordRecoveryOtp.code !== code) {
        // Incrementar intentos
        user.passwordRecoveryOtp.attempts += 1;
        await user.save();

        return res.status(400).json({
          message: 400,
          message_text: `Código incorrecto. Te quedan ${3 - user.passwordRecoveryOtp.attempts} intentos.`,
          attemptsRemaining: 3 - user.passwordRecoveryOtp.attempts
        });
      }

      // ¡Código correcto! Generar token temporal para cambio de contraseña
      const recoveryToken = await token.encode(user._id, user.rol, user.email, 'password_recovery');
      
      // Limpiar OTP de recuperación
      user.passwordRecoveryOtp = undefined;
      await user.save();

      console.log(`✅ Código de recuperación verificado exitosamente para: ${user.email}`);

      res.status(200).json({
        message: "Código verificado correctamente. Ahora puedes cambiar tu contraseña.",
        recoveryToken: recoveryToken,
        userId: user._id
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },

  // Cambiar contraseña con token de recuperación
  reset_password: async (req, res) => {
    try {
      const { recoveryToken, newPassword } = req.body;

      if (!recoveryToken || !newPassword) {
        return res.status(400).json({
          message: 400,
          message_text: "Token de recuperación y nueva contraseña son requeridos",
        });
      }

      // Verificar token de recuperación
      const decodedToken = await token.decode(recoveryToken);
      if (!decodedToken || decodedToken.type !== 'password_recovery') {
        return res.status(401).json({
          message: 401,
          message_text: "Token de recuperación inválido",
        });
      }

      const user = await models.User.findById(decodedToken.user_id);
      if (!user) {
        return res.status(404).json({
          message: 404,
          message_text: "Usuario no encontrado",
        });
      }

      // Encriptar nueva contraseña
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      await user.save();

      console.log(`✅ Contraseña restablecida exitosamente para: ${user.email}`);

      res.status(200).json({
        message: "Contraseña restablecida exitosamente. Ya puedes iniciar sesión.",
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },

  // Reenviar código OTP de recuperación
  resend_recovery_otp: async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          message: 400,
          message_text: "El email es requerido",
        });
      }

      const user = await models.User.findOne({ email: email });
      if (!user) {
        return res.status(404).json({
          message: 404,
          message_text: "Usuario no encontrado",
        });
      }

      // Verificar límite de reenvíos diarios (5 por día)
      if (user.passwordRecoveryOtp && user.passwordRecoveryOtp.resends >= 5) {
        const lastResend = new Date(user.passwordRecoveryOtp.lastResendAt);
        const now = new Date();
        const hoursSinceLastResend = (now - lastResend) / (1000 * 60 * 60);
        
        if (hoursSinceLastResend < 24) {
          return res.status(429).json({
            message: 429,
            message_text: "Has alcanzado el límite de reenvíos por hoy. Inténtalo mañana.",
          });
        }
      }

      // Rate limiting: no permitir reenvíos antes de 60 segundos
      if (user.passwordRecoveryOtp && user.passwordRecoveryOtp.lastResendAt) {
        const secondsSinceLastResend = (new Date() - new Date(user.passwordRecoveryOtp.lastResendAt)) / 1000;
        if (secondsSinceLastResend < 60) {
          return res.status(429).json({
            message: 429,
            message_text: `Debes esperar ${Math.ceil(60 - secondsSinceLastResend)} segundos antes de reenviar.`,
            waitSeconds: Math.ceil(60 - secondsSinceLastResend)
          });
        }
      }

      // Generar nuevo código OTP de recuperación
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

      // Actualizar OTP de recuperación
      user.passwordRecoveryOtp = {
        code: otpCode,
        expiresAt: otpExpiration,
        attempts: 0,
        resends: (user.passwordRecoveryOtp?.resends || 0) + 1,
        lastResendAt: new Date()
      };

      await user.save();

      // Enviar nuevo OTP de recuperación por Telegram
      try {
        await sendRecoveryOtp({ 
          code: otpCode, 
          phone: user.phone, 
          userName: user.name 
        });
        console.log(`✅ OTP de recuperación reenviado a Telegram para ${user.name}: ${otpCode}`);
      } catch (telegramError) {
        console.error('❌ Error reenviando OTP de recuperación:', telegramError);
        return res.status(500).json({
          message: "Error al enviar el código de recuperación. Inténtalo de nuevo.",
        });
      }

      res.status(200).json({
        message: "Código de recuperación reenviado exitosamente. Revisa tu Telegram.",
        expiresIn: 600, // segundos
        resendsRemaining: 5 - user.passwordRecoveryOtp.resends
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },

  // =====================================================
  // ENDPOINT DE PRUEBA PARA GENERAR OTP
  // =====================================================

  // 🆕 NUEVO: Listar instructores (público)
  list_instructors: async (req, res) => {
    try {
      // Buscar solo usuarios con rol 'instructor' que estén activos
      const instructors = await models.User.find({ 
        rol: 'instructor',
        state: true 
      })
      .select('name surname email avatar profession description facebook instagram youtube tiktok twitch website')
      .sort({ createdAt: -1 });

      res.status(200).send({
        users: instructors
      });
    } catch (error) {
      console.error('❌ Error listando instructores:', error);
      res.status(500).send({
        message: "Error al obtener la lista de instructores"
      });
    }
  },

  // 🆕 NUEVO: Perfil público del instructor
  instructor_profile: async (req, res) => {
    try {
      const { id } = req.params;

      // Buscar instructor
      const instructor = await models.User.findOne({ 
        _id: id,
        rol: 'instructor',
        state: true 
      })
      .select('name surname email avatar profession description phone birthday socialMedia createdAt');

      if (!instructor) {
        return res.status(404).send({
          message: "Instructor no encontrado"
        });
      }

      // Buscar cursos del instructor (solo públicos)
      const courses = await models.Course.find({
        user: id,
        state: 2 // Solo cursos públicos
      })
      .populate('categorie', 'title')
      .select('title subtitle slug imagen price_usd price_mxn level avg_rating count_class')
      .sort({ createdAt: -1 });

      // Buscar proyectos del instructor (solo públicos)
      // Estados: 1=Borrador, 2=Público, 3=Anulado
      const rawProjects = await models.Project.find({
        user: id,
        state: 2 // ✅ CORREGIDO: 2 = Público (antes estaba mal con state: 1)
      })
      .populate('categorie', 'title')
      .select('title subtitle imagen price_usd price_mxn description url_video state createdAt')
      .sort({ createdAt: -1 });
      
      console.log('✅ [instructor_profile] Proyectos públicos encontrados:', rawProjects.length);

      // ✅ Mapear proyectos con valores por defecto para campos opcionales
      const projects = rawProjects.map(proj => ({
        _id: proj._id,
        title: proj.title,
        subtitle: proj.subtitle,
        imagen: proj.imagen,
        price_usd: proj.price_usd,
        price_mxn: proj.price_mxn || 0, // ✅ Valor por defecto
        description: proj.description || '', // ✅ Valor por defecto
        url_video: proj.url_video,
        categorie: proj.categorie,
        state: proj.state,
        createdAt: proj.createdAt
      }));

      res.status(200).send({
        instructor: resource.User.api_resource_user(instructor),
        courses,
        projects
      });
    } catch (error) {
      console.error('❌ Error obteniendo perfil del instructor:', error);
      res.status(500).send({
        message: "Error al obtener el perfil del instructor"
      });
    }
  },

  // Generar OTP para usuario existente (solo para testing)
  generate_otp_for_existing_user: async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          message: 400,
          message_text: "El ID del usuario es requerido",
        });
      }

      const user = await models.User.findById(userId);
      if (!user) {
        return res.status(404).json({
          message: 404,
          message_text: "Usuario no encontrado",
        });
      }

      // Verificar que tenga teléfono
      if (!user.phone) {
        return res.status(400).json({
          message: 400,
          message_text: "El usuario no tiene teléfono registrado",
        });
      }

      // Generar código OTP de 6 dígitos
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

      // Actualizar OTP
      user.otp = {
        code: otpCode,
        expiresAt: otpExpiration,
        attempts: 0,
        resends: 0,
        lastResendAt: new Date()
      };

      await user.save();

      // Enviar OTP por Telegram
      try {
        await sendOtpCode({ 
          code: otpCode, 
          phone: user.phone, 
          userName: user.name 
        });
        console.log(`✅ OTP generado y enviado a Telegram para ${user.name}: ${otpCode}`);
      } catch (telegramError) {
        console.error('❌ Error enviando OTP:', telegramError);
        return res.status(500).json({
          message: "Error al enviar el código. Verifica la configuración de Telegram.",
        });
      }

      res.status(200).json({
        message: "Código OTP generado y enviado exitosamente. Revisa tu Telegram.",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone
        },
        otpCode: otpCode, // Solo para testing
        expiresIn: 600 // segundos
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },
};
