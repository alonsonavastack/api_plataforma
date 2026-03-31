import models from "../models/index.js";
import bcrypt from "bcryptjs";
import token from "../service/token.js";
import resource from "../resource/index.js";
import { sendOtpCode, sendRecoveryOtp, notifyNewRegistration, notifySuccessfulVerification } from "../helpers/telegram.js";
import { generateUniqueSlug } from "../helpers/slugGenerator.js";
import { getIO } from '../services/socket.service.js';

import fs from "fs";
import path from "path";

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🛡️ SECURITY: Input Sanitization
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

export default {
  register: async (req, res) => {
    try {
      if (req.body.name) req.body.name = DOMPurify.sanitize(req.body.name);
      if (req.body.surname) req.body.surname = DOMPurify.sanitize(req.body.surname);
      if (req.body.email) req.body.email = DOMPurify.sanitize(req.body.email);
      if (req.body.phone) req.body.phone = DOMPurify.sanitize(req.body.phone);
      if (req.body.profession) req.body.profession = DOMPurify.sanitize(req.body.profession);
      if (req.body.description) req.body.description = DOMPurify.sanitize(req.body.description);

      const VALID_USER = await models.User.findOne({ email: req.body.email });

      if (VALID_USER) {
        if (!VALID_USER.isVerified) {
          return res.status(409).json({
            message: 409,
            message_text: "Este correo ya está registrado pero no ha sido verificado.",
            requiresVerification: true,
            userId: VALID_USER._id
          });
        }
        return res.status(409).json({
          message: 409,
          message_text: "EL USUARIO INGRESADO YA EXISTE",
        });
      }

      if (req.body.phone) {
        console.log('📱 [Register] Validando teléfono único:', req.body.phone);
        const PHONE_EXISTS = await models.User.findOne({ phone: req.body.phone });
        if (PHONE_EXISTS) {
          console.log('❌ [Register] Teléfono duplicado encontrado:', req.body.phone);
          return res.status(409).json({
            message: 409,
            message_text: "EL NÚMERO DE TELÉFONO YA ESTÁ REGISTRADO",
          });
        }
        console.log('✅ [Register] Teléfono disponible:', req.body.phone);
      }

      if (!req.body.phone || req.body.phone.length < 10) {
        return res.status(400).json({
          message: 400,
          message_text: "El teléfono es requerido y debe estar en formato E.164 (ej: 52155XXXXXXX)",
        });
      }

      if (req.body.country === 'INTL') {
        delete req.body.country;
      }

      req.body.password = await bcrypt.hash(req.body.password, 10);

      req.body.slug = await generateUniqueSlug(
        models.User,
        req.body.name,
        req.body.surname
      );
      console.log('🆔 [Register] Slug generado:', req.body.slug);

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000);

      req.body.isVerified = false;
      req.body.otp = {
        code: otpCode,
        expiresAt: otpExpiration,
        attempts: 0,
        resends: 0,
        lastResendAt: new Date()
      };

      const User = await models.User.create(req.body);

      let telegramResponse = false;
      try {
        console.log(`📤 Intentando enviar OTP a Telegram para ${req.body.name}...`);
        telegramResponse = await sendOtpCode({
          code: otpCode,
          phone: req.body.phone,
          userName: `${req.body.name} ${req.body.surname}`,
          chatId: req.body.telegram_chat_id || null
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
        return res.status(200).json({
          message: 'Usuario registrado pero hubo un error al enviar el código. Contacta soporte.',
          user: resource.User.api_resource_user(User),
          otpSent: false
        });
      }

      try {
        await notifyNewRegistration(User, otpCode);
      } catch (telegramError) {
        console.error('❌ Error enviando Telegram:', {
          message: telegramError.message,
          stack: telegramError.stack,
          telefono: req.body.phone,
          codigo: otpCode
        });
        return res.status(200).json({
          message: 'Usuario registrado pero hubo un error al enviar el código. Contacta soporte.',
          user: resource.User.api_resource_user(User),
          otpSent: false
        });
      }

      try {
        const io = getIO();
        io.to(`user_register_${User._id}`).emit('new_otp_code', { code: otpCode });
        console.log(`📡 Socket: OTP emitido a la sala user_register_${User._id}`);
      } catch (socketErr) {
        console.log("No se pudo emitir evento de socket", socketErr.message);
      }

      res.status(200).json({
        message: telegramResponse ? 'Usuario registrado. Revisa tu Telegram para verificar tu cuenta.' : 'Usuario registrado. Por favor vincula tu Telegram para verificar tu cuenta.',
        user: resource.User.api_resource_user(User),
        otpSent: !!telegramResponse,
        expiresIn: 600
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  register_admin: async (req, res) => {
    try {
      if (req.body.name) req.body.name = DOMPurify.sanitize(req.body.name);
      if (req.body.surname) req.body.surname = DOMPurify.sanitize(req.body.surname);
      if (req.body.email) req.body.email = DOMPurify.sanitize(req.body.email);
      if (req.body.phone) req.body.phone = DOMPurify.sanitize(req.body.phone);

      const VALID_USER = await models.User.findOne({ email: req.body.email });
      if (VALID_USER) {
        return res.status(200).json({ message: 403, message_text: "EL USUARIO INGRESADO YA EXISTE" });
      }

      if (req.body.phone) {
        const PHONE_EXISTS = await models.User.findOne({ phone: req.body.phone });
        if (PHONE_EXISTS) {
          return res.status(200).json({ message: 403, message_text: "EL NÚMERO DE TELÉFONO YA ESTÁ REGISTRADO" });
        }
      }

      if (req.body.country === 'INTL') delete req.body.country;

      req.body.password = await bcrypt.hash(req.body.password, 10);
      if (req.files && req.files.avatar) {
        const img_path = req.files.avatar.path;
        const avatar_name = path.basename(img_path);
        req.body.avatar = avatar_name;
      }
      const User = await models.User.create(req.body);
      res.status(200).json({ user: resource.User.api_resource_user(User) });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  update: async (req, res) => {
    try {
      if (req.body.name) req.body.name = DOMPurify.sanitize(req.body.name);
      if (req.body.surname) req.body.surname = DOMPurify.sanitize(req.body.surname);
      if (req.body.email) req.body.email = DOMPurify.sanitize(req.body.email);
      if (req.body.phone) req.body.phone = DOMPurify.sanitize(req.body.phone);
      if (req.body.profession) req.body.profession = DOMPurify.sanitize(req.body.profession);
      if (req.body.description) req.body.description = DOMPurify.sanitize(req.body.description);

      const socialFields = ['facebook', 'instagram', 'youtube', 'tiktok', 'twitch', 'website', 'discord', 'linkedin', 'twitter', 'github'];
      socialFields.forEach(field => {
        if (req.body[field]) req.body[field] = DOMPurify.sanitize(req.body[field]);
      });

      const userIdToUpdate = req.body._id || req.user._id;
      if (!userIdToUpdate) {
        return res.status(400).send({ message: 'No se especificó un ID de usuario.' });
      }

      const VALID_USER = await models.User.findOne({
        email: req.body.email,
        _id: { $ne: userIdToUpdate },
      });
      if (VALID_USER) {
        return res.status(200).json({ message: 403, message_text: "EL USUARIO INGRESADO YA EXISTE" });
      }

      if (req.body.phone && req.body.phone.trim() !== '') {
        console.log('📱 [Update] Validando teléfono único:', req.body.phone, 'para usuario:', userIdToUpdate);
        const PHONE_EXISTS = await models.User.findOne({
          phone: req.body.phone,
          _id: { $ne: userIdToUpdate },
        });
        if (PHONE_EXISTS) {
          console.log('❌ [Update] Teléfono duplicado encontrado:', req.body.phone, 'usado por:', PHONE_EXISTS._id);
          return res.status(200).json({ message: 403, message_text: "EL NÚMERO DE TELÉFONO YA ESTÁ REGISTRADO POR OTRO USUARIO" });
        }
        console.log('✅ [Update] Teléfono disponible:', req.body.phone);
      }

      if (req.body.country === 'INTL') delete req.body.country;

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
        socialFields.forEach(f => delete req.body[f]);
      }

      if (req.body.password && req.body.password.trim() !== '') {
        req.body.password = await bcrypt.hash(req.body.password, 10);
      } else {
        delete req.body.password;
      }

      if (req.files && req.files.avatar) {
        const oldUser = await models.User.findById(userIdToUpdate);
        if (oldUser.avatar && fs.existsSync(path.join(__dirname, "../uploads/user/", oldUser.avatar))) {
          fs.unlinkSync(path.join(__dirname, "../uploads/user/", oldUser.avatar));
        }
        const img_path = req.files.avatar.path;
        const avatar_name = path.basename(img_path);
        req.body.avatar = avatar_name;
      }

      const updatedUser = await models.User.findByIdAndUpdate(userIdToUpdate, req.body, { new: true });

      console.log('✅ [Update] Usuario actualizado exitosamente:', {
        userId: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        hasPassword: !!updatedUser.password,
        state: updatedUser.state
      });

      res.status(200).json({
        message: "EL USUARIO SE EDITO CORRECTAMENTE",
        user: resource.User.api_resource_user(updatedUser),
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  update_password: async (req, res) => {
    try {
      if (!req.user) return res.status(401).send({ message: 'No autenticado.' });
      const { currentPassword, newPassword } = req.body;
      const user = await models.User.findById(req.user._id);
      if (!user) return res.status(404).send({ message: 'Usuario no encontrado.' });
      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) return res.status(400).json({ message_text: 'La contraseña actual es incorrecta.' });
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await models.User.findByIdAndUpdate(req.user._id, { password: hashedNewPassword });
      res.status(200).json({ message: 'La contraseña se actualizó correctamente.' });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: 'HUBO UN ERROR' });
    }
  },

  update_avatar: async (req, res) => {
    try {
      if (!req.user) return res.status(401).send({ message: 'No autenticado.' });
      console.log('📸 [Update Avatar] Request received for user:', req.user._id);
      console.log('📁 [Debug Files]:', req.files);
      const userIdToUpdate = req.user._id;
      if (req.files && req.files.avatar) {
        const oldUser = await models.User.findById(userIdToUpdate);
        if (oldUser.avatar && fs.existsSync(path.join(__dirname, '../uploads/user/', oldUser.avatar))) {
          try {
            fs.unlinkSync(path.join(__dirname, '../uploads/user/', oldUser.avatar));
          } catch (err) {
            console.warn('⚠️ No se pudo eliminar avatar anterior:', err.message);
          }
        }
        const img_path = req.files.avatar.path;
        const avatar_name = path.basename(img_path);
        const updatedUser = await models.User.findByIdAndUpdate(userIdToUpdate, { avatar: avatar_name }, { new: true });
        res.status(200).json({ message: 'El avatar se actualizó correctamente.', user: resource.User.api_resource_user(updatedUser) });
      } else {
        console.error('❌ [Update Avatar] No se recibió archivo "avatar"');
        return res.status(400).send({ message: 'No se proporcionó ningún archivo de avatar.' });
      }
    } catch (error) {
      console.log('❌ [Update Avatar] Error:', error);
      res.status(500).send({ message: 'HUBO UN ERROR' });
    }
  },

  set_telegram_chat: async (req, res) => {
    try {
      const userId = req.params.id;
      const { chat_id } = req.body;
      if (!chat_id) return res.status(400).send({ message: 'chat_id requerido' });
      const user = await models.User.findById(userId);
      if (!user) return res.status(404).send({ message: 'Usuario no encontrado' });
      user.telegram_chat_id = String(chat_id);
      await user.save();
      console.log(`🔧 Admin asignó telegram_chat_id ${chat_id} a usuario ${user.email}`);
      return res.status(200).send({ message: 'telegram_chat_id actualizado', user: resource.User.api_resource_user(user) });
    } catch (error) {
      console.error('❌ Error en set_telegram_chat:', error);
      return res.status(500).send({ message: 'error' });
    }
  },

  update_state: async (req, res) => {
    try {
      const userId = req.params.id;
      const { state } = req.body;
      console.log('=== update_state called ===');
      console.log('userId:', userId);
      console.log('state received:', state, 'type:', typeof state);
      if (typeof state !== 'boolean') {
        console.log('Error: state is not boolean');
        return res.status(400).json({ message: 400, message_text: "El estado debe ser un valor booleano" });
      }
      const user = await models.User.findById(userId);
      if (!user) {
        console.log('Error: User not found');
        return res.status(404).json({ message: 404, message_text: "Usuario no encontrado" });
      }
      console.log('User found:', user.name, user.email);
      console.log('Current state:', user.state);
      console.log('New state value:', state);
      const updatedUser = await models.User.findByIdAndUpdate(userId, { state: state }, { new: true });
      console.log('User updated successfully. Updated state:', updatedUser.state);
      res.status(200).json({ message: "Estado del usuario actualizado correctamente", user: resource.User.api_resource_user(updatedUser) });
    } catch (error) {
      console.error('=== ERROR in update_state ===');
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA", error: error.message });
    }
  },

  list: async (req, res) => {
    try {
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
      if (rol) filter.rol = rol;
      filter.rol = { $in: ["admin", "instructor", ...(rol ? [rol] : [])] };
      const USERS = await models.User.find(filter).sort({ createdAt: -1 });
      const usersFormatted = USERS.map((user) => resource.User.api_resource_user(user));
      res.status(200).json({ users: usersFormatted });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  remove: async (req, res) => {
    try {
      const _id = req.params["id"];
      const User = await models.User.findById({ _id: _id });
      if (!User) {
        return res.status(404).json({ message: 404, message_text: "El usuario no existe." });
      }
      console.log(`🗑️ [Remove User] Validando eliminación de usuario: ${User.name} ${User.surname} (${User.rol})`);

      if (User.rol === "instructor") {
        const courseCount = await models.Course.countDocuments({ user: _id });
        console.log(`   📚 Cursos encontrados: ${courseCount}`);
        if (courseCount > 0) {
          return res.status(403).json({ message: 403, message_text: `No se puede eliminar al instructor porque tiene ${courseCount} curso(s) creado(s).`, blockedBy: 'courses', count: courseCount });
        }
        const projectCount = await models.Project.countDocuments({ user: _id });
        console.log(`   🎯 Proyectos encontrados: ${projectCount}`);
        if (projectCount > 0) {
          return res.status(403).json({ message: 403, message_text: `No se puede eliminar al instructor porque tiene ${projectCount} proyecto(s) creado(s).`, blockedBy: 'projects', count: projectCount });
        }
        const salesAsInstructor = await models.Sale.countDocuments({ 'details.course.user': _id });
        console.log(`   💰 Ventas como instructor: ${salesAsInstructor}`);
        if (salesAsInstructor > 0) {
          return res.status(403).json({ message: 403, message_text: `No se puede eliminar al instructor porque tiene ${salesAsInstructor} venta(s) registrada(s).`, blockedBy: 'sales', count: salesAsInstructor });
        }
      }

      if (User.rol === "cliente") {
        const purchaseCount = await models.Sale.countDocuments({ user: _id });
        console.log(`   🛒 Compras encontradas: ${purchaseCount}`);
        if (purchaseCount > 0) {
          return res.status(403).json({ message: 403, message_text: `No se puede eliminar al estudiante porque tiene ${purchaseCount} compra(s) realizada(s).`, blockedBy: 'purchases', count: purchaseCount });
        }
        const reviewCount = await models.Review.countDocuments({ user: _id });
        console.log(`   ⭐ Reviews encontradas: ${reviewCount}`);
        if (reviewCount > 0) {
          return res.status(403).json({ message: 403, message_text: `No se puede eliminar al estudiante porque tiene ${reviewCount} reseña(s) publicada(s).`, blockedBy: 'reviews', count: reviewCount });
        }
      }

      if (User.avatar) {
        const imagePath = path.join(__dirname, "../uploads/user/", User.avatar);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log(`   🖼️ Avatar eliminado: ${User.avatar}`);
        }
      }
      await models.User.findByIdAndDelete(_id);
      console.log(`✅ [Remove User] Usuario eliminado exitosamente: ${User.name} ${User.surname}`);
      res.status(200).json({ message: 200, message_text: "El usuario se eliminó correctamente." });
    } catch (error) {
      console.error('❌ [Remove User] Error:', error);
      res.status(500).send({ message: 500, message_text: "Ocurrió un problema al eliminar el usuario." });
    }
  },

  get_imagen: async (req, res) => {
    try {
      const img = req.params["img"];
      if (!img) {
        res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
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
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  profile: async (req, res) => {
    try {
      const user_profile = await models.User.findById(req.user._id);
      if (!user_profile) return res.status(404).send({ message: "Usuario no encontrado." });
      res.status(200).json({
        user: { _id: user_profile._id, rol: user_profile.rol },
        profile: resource.User.api_resource_user(user_profile),
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "HUBO UN ERROR" });
    }
  },

  login_general: async (req, res) => {
    try {
      if (req.body.email) req.body.email = DOMPurify.sanitize(req.body.email);
      console.log('🔑 [Login] Intento de login para:', req.body.email);

      const user = await models.User.findOne({ email: req.body.email, state: true });
      if (!user) {
        console.log('❌ [Login] Usuario no encontrado o inactivo:', req.body.email);
        return res.status(404).json({ message: 404, message_text: "No encontramos una cuenta asociada a este correo electrónico." });
      }

      console.log('👤 [Login] Usuario encontrado:', { id: user._id, email: user.email, name: user.name, hasPassword: !!user.password, state: user.state, isVerified: user.isVerified });

      const match = await bcrypt.compare(req.body.password, user.password);
      if (!match) {
        return res.status(401).json({ message: 401, message_text: "La contraseña es incorrecta." });
      }

      if (!user.isVerified) {
        return res.status(403).json({
          message: 403,
          message_text: "Tu cuenta aún no ha sido verificada. Hemos enviado un código a tu Telegram.",
          requiresVerification: true,
          userId: user._id
        });
      }

      const tokenReturn = await token.encode(user._id, user.rol, user.email);
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

  // ✅ FIX 2: Client ID tomado SOLO de process.env — sin hardcodear en código fuente
  google_login: async (req, res) => {
    try {
      const { token: googleToken } = req.body;
      if (!googleToken) {
        return res.status(400).json({ message_text: "Token de Google es requerido." });
      }

      let jwt;
      try {
        jwt = (await import('jsonwebtoken')).default || await import('jsonwebtoken');
      } catch (err) {
        console.error("Error cargando jsonwebtoken", err);
      }

      let payload;
      try {
        const { OAuth2Client } = await import('google-auth-library');
        // ✅ Sin hardcodear — solo process.env.GOOGLE_CLIENT_ID
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
          idToken: googleToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch (err) {
        console.log("⚠️ No se pudo usar google-auth-library. Usando fallback jwt.decode...");
        payload = jwt ? jwt.decode(googleToken) : null;
      }

      if (!payload || !payload.email) {
        return res.status(400).json({ message_text: "Token de Google inválido." });
      }

      const { email, name, family_name, sub: google_id, picture } = payload;

      let user = await models.User.findOne({ email });

      if (user) {
        // Vincular con Google si aún no está vinculado, y asegurar que esté verificado
        if (!user.google_id) {
          user.google_id = google_id;
          user.auth_provider = 'google';
          if (!user.isVerified) user.isVerified = true;
          await user.save();
        }
      } else {
        // Crear usuario nuevo — Google ya verificó el email
        user = await models.User.create({
          name: name || 'Usuario',
          surname: family_name || 'Google',
          email: email,
          password: await bcrypt.hash(google_id + Date.now().toString(), 10),
          avatar: picture || null,
          state: true,
          rol: 'cliente',
          isVerified: true,
          auth_provider: 'google',
          google_id: google_id
        });
      }

      if (!user.state) {
        return res.status(404).json({ message_text: "Tu cuenta está desactivada." });
      }

      const tokenReturn = await token.encode(user._id, user.rol, user.email);

      res.status(200).json({
        USER: {
          token: tokenReturn,
          user: { _id: user._id, rol: user.rol },
          profile: resource.User.api_resource_user(user),
        },
      });
    } catch (error) {
      console.error("Error en Google Login:", error);
      res.status(500).json({ message: "Ocurrió un error en el servidor procesando Google Auth." });
    }
  },

  debug_token: async (req, res) => {
    try {
      const user = await models.User.findOne({ rol: 'admin' });
      if (!user) return res.status(404).send('No admin found');
      const t = await token.encode(user._id, user.rol, user.email);
      res.json({ token: t, user });
    } catch (e) {
      res.status(500).send(e.message);
    }
  },

  debug_user_with_project: async (req, res) => {
    try {
      const sale = await models.Sale.findOne({ "detail.product_type": "project", status: "Pagado" });
      if (!sale) return res.status(404).send('No sale with project found');
      const user = await models.User.findById(sale.user);
      const t = await token.encode(user._id, user.rol, user.email);
      res.json({ token: t, user, saleId: sale._id });
    } catch (e) {
      res.status(500).send(e.message);
    }
  },

  // =====================================================
  // MÉTODOS DE VERIFICACIÓN OTP
  // =====================================================

  resend_otp_by_email: async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: 400, message_text: "El correo electrónico es requerido" });
      }

      const user = await models.User.findOne({ email: email });
      if (!user) {
        return res.status(404).json({ message: 404, message_text: "No encontramos una cuenta con este correo." });
      }

      if (user.isVerified) {
        return res.status(400).json({ message: 400, message_text: "Esta cuenta ya está verificada. Por favor inicia sesión.", isVerified: true });
      }

      const now = new Date();
      if (user.otp && user.otp.lastResendAt) {
        const timeDiff = now - new Date(user.otp.lastResendAt);
        const minutesDiff = Math.floor(timeDiff / 1000 / 60);
        if (minutesDiff < 1) {
          return res.status(429).json({ message: 429, message_text: "Por favor espera 1 minuto antes de solicitar otro código.", waitSeconds: 60 - Math.floor(timeDiff / 1000) });
        }
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000);

      user.otp = { code: otpCode, expiresAt: otpExpiration, attempts: 0, resends: (user.otp?.resends || 0) + 1, lastResendAt: now };
      await user.save();

      try {
        await sendOtpCode({ code: otpCode, phone: user.phone, userName: user.name, chatId: user.telegram_chat_id });
        await notifyNewRegistration(user, otpCode);
        try {
          const io = getIO();
          io.to(`user_register_${user._id}`).emit('new_otp_code', { code: otpCode });
        } catch (socketErr) {
          console.log("No se pudo emitir evento de socket", socketErr.message);
        }
      } catch (error) {
        console.error('❌ Error enviando OTP:', error);
        return res.status(500).json({ message: 500, message_text: "Error al enviar el código. Intenta nuevamente." });
      }

      res.status(200).json({ message: 200, message_text: "Código reenviado exitosamente.", userId: user._id });
    } catch (error) {
      console.error('❌ Error en resend_otp_by_email:', error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  verify_otp: async (req, res) => {
    try {
      const { userId, code } = req.body;
      if (!userId || !code) {
        return res.status(400).json({ message: 400, message_text: "Usuario y código son requeridos" });
      }

      const user = await models.User.findById(userId);
      if (!user) return res.status(404).json({ message: 404, message_text: "Usuario no encontrado" });
      if (user.isVerified) return res.status(200).json({ message: "Tu cuenta ya está verificada", alreadyVerified: true });
      if (!user.otp || !user.otp.code) return res.status(400).json({ message: 400, message_text: "No hay código pendiente. Solicita uno nuevo." });
      if (user.otp.attempts >= 3) return res.status(403).json({ message: 403, message_text: "Has excedido el número de intentos. Solicita un nuevo código." });
      if (new Date() > user.otp.expiresAt) return res.status(410).json({ message: 410, message_text: "El código ha expirado. Solicita uno nuevo." });

      if (user.otp.code !== code) {
        user.otp.attempts += 1;
        await user.save();
        return res.status(400).json({ message: 400, message_text: `Código incorrecto. Te quedan ${3 - user.otp.attempts} intentos.`, attemptsRemaining: 3 - user.otp.attempts });
      }

      user.isVerified = true;
      user.otp = undefined;
      await user.save();

      const tokenReturn = await token.encode(user._id, user.rol, user.email);
      console.log(`✅ Usuario verificado exitosamente: ${user.email}`);
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
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  resend_otp: async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: 400, message_text: "El ID del usuario es requerido" });

      const user = await models.User.findById(userId);
      if (!user) return res.status(404).json({ message: 404, message_text: "Usuario no encontrado" });
      if (user.isVerified) return res.status(200).json({ message: "Tu cuenta ya está verificada", alreadyVerified: true });

      if (user.otp && user.otp.resends >= 5) {
        const lastResend = new Date(user.otp.lastResendAt);
        const hoursSinceLastResend = (new Date() - lastResend) / (1000 * 60 * 60);
        if (hoursSinceLastResend < 24) {
          return res.status(429).json({ message: 429, message_text: "Has alcanzado el límite de reenvíos por hoy. Inténtalo mañana." });
        }
      }

      if (user.otp && user.otp.lastResendAt) {
        const secondsSinceLastResend = (new Date() - new Date(user.otp.lastResendAt)) / 1000;
        if (secondsSinceLastResend < 60) {
          return res.status(429).json({ message: 429, message_text: `Debes esperar ${Math.ceil(60 - secondsSinceLastResend)} segundos antes de reenviar.`, waitSeconds: Math.ceil(60 - secondsSinceLastResend) });
        }
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000);

      user.otp = { code: otpCode, expiresAt: otpExpiration, attempts: 0, resends: (user.otp?.resends || 0) + 1, lastResendAt: new Date() };
      await user.save();

      let telegramResponse = false;
      try {
        telegramResponse = await sendOtpCode({ code: otpCode, phone: user.phone, userName: user.name, chatId: user.telegram_chat_id });
        if (telegramResponse) {
          console.log(`✅ OTP reenviado a Telegram para ${user.name}: ${otpCode}`);
        } else {
          console.log(`⚠️ OTP no se pudo enviar a Telegram para ${user.name} (falta chat_id).`);
        }
        await notifyNewRegistration(user, otpCode);
        try {
          const io = getIO();
          io.to(`user_register_${user._id}`).emit('new_otp_code', { code: otpCode });
        } catch (socketErr) {
          console.log("No se pudo emitir evento de socket", socketErr.message);
        }
      } catch (telegramError) {
        console.error('❌ Error reenviando Telegram:', telegramError);
        return res.status(500).json({ message: "Error al enviar el código. Inténtalo de nuevo." });
      }

      res.status(200).json({
        message: telegramResponse ? "Código reenviado exitosamente. Revisa tu Telegram." : "Código generado. Asegúrate de vincular tu cuenta con Telegram para recibirlo.",
        expiresIn: 600,
        resendsRemaining: 5 - user.otp.resends
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  // =====================================================
  // MÉTODOS DE RECUPERACIÓN DE CONTRASEÑA
  // =====================================================

  request_password_recovery: async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: 400, message_text: "El email es requerido" });

      const user = await models.User.findOne({ email: email });
      if (!user) return res.status(404).json({ message: 404, message_text: "No se encontró un usuario con ese email" });
      if (!user.isVerified) return res.status(403).json({ message: 403, message_text: "Debes verificar tu cuenta antes de recuperar la contraseña" });
      if (!user.phone) return res.status(400).json({ message: 400, message_text: "No tienes un teléfono registrado para recuperar la contraseña" });

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000);

      user.passwordRecoveryOtp = { code: otpCode, expiresAt: otpExpiration, attempts: 0, resends: 0, lastResendAt: new Date() };
      await user.save();

      try {
        await sendRecoveryOtp({ code: otpCode, phone: user.phone, userName: user.name, chatId: user.telegram_chat_id });
        console.log(`✅ OTP de recuperación enviado a Telegram para ${user.name}: ${otpCode}`);
      } catch (telegramError) {
        console.error('❌ Error enviando OTP de recuperación:', telegramError);
        return res.status(500).json({ message: "Error al enviar el código de recuperación. Inténtalo de nuevo." });
      }

      res.status(200).json({ message: "Código de recuperación enviado. Revisa tu Telegram.", expiresIn: 600 });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  verify_recovery_otp: async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ message: 400, message_text: "Email y código son requeridos" });

      const user = await models.User.findOne({ email: email });
      if (!user) return res.status(404).json({ message: 404, message_text: "Usuario no encontrado" });
      if (!user.passwordRecoveryOtp || !user.passwordRecoveryOtp.code) return res.status(400).json({ message: 400, message_text: "No hay código de recuperación pendiente. Solicita uno nuevo." });
      if (user.passwordRecoveryOtp.attempts >= 3) return res.status(403).json({ message: 403, message_text: "Has excedido el número de intentos. Solicita un nuevo código." });
      if (new Date() > user.passwordRecoveryOtp.expiresAt) return res.status(410).json({ message: 410, message_text: "El código ha expirado. Solicita uno nuevo." });

      if (user.passwordRecoveryOtp.code !== code) {
        user.passwordRecoveryOtp.attempts += 1;
        await user.save();
        return res.status(400).json({ message: 400, message_text: `Código incorrecto. Te quedan ${3 - user.passwordRecoveryOtp.attempts} intentos.`, attemptsRemaining: 3 - user.passwordRecoveryOtp.attempts });
      }

      const recoveryToken = await token.encode(user._id, user.rol, user.email, 'password_recovery');
      user.passwordRecoveryOtp = undefined;
      await user.save();
      console.log(`✅ Código de recuperación verificado exitosamente para: ${user.email}`);
      res.status(200).json({ message: "Código verificado correctamente. Ahora puedes cambiar tu contraseña.", recoveryToken: recoveryToken, userId: user._id });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  reset_password: async (req, res) => {
    try {
      const { recoveryToken, newPassword } = req.body;
      if (!recoveryToken || !newPassword) return res.status(400).json({ message: 400, message_text: "Token de recuperación y nueva contraseña son requeridos" });

      const decodedToken = await token.decode(recoveryToken);
      if (!decodedToken || decodedToken.type !== 'password_recovery') return res.status(401).json({ message: 401, message_text: "Token de recuperación inválido" });

      const user = await models.User.findById(decodedToken.user_id);
      if (!user) return res.status(404).json({ message: 404, message_text: "Usuario no encontrado" });

      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();
      res.status(200).json({ message: "Contraseña restablecida exitosamente. Ya puedes iniciar sesión." });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  resend_recovery_otp: async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: 400, message_text: "El email es requerido" });

      const user = await models.User.findOne({ email: email });
      if (!user) return res.status(404).json({ message: 404, message_text: "Usuario no encontrado" });

      if (user.passwordRecoveryOtp && user.passwordRecoveryOtp.resends >= 5) {
        const hoursSinceLastResend = (new Date() - new Date(user.passwordRecoveryOtp.lastResendAt)) / (1000 * 60 * 60);
        if (hoursSinceLastResend < 24) return res.status(429).json({ message: 429, message_text: "Has alcanzado el límite de reenvíos por hoy. Inténtalo mañana." });
      }

      if (user.passwordRecoveryOtp && user.passwordRecoveryOtp.lastResendAt) {
        const secondsSinceLastResend = (new Date() - new Date(user.passwordRecoveryOtp.lastResendAt)) / 1000;
        if (secondsSinceLastResend < 60) return res.status(429).json({ message: 429, message_text: `Debes esperar ${Math.ceil(60 - secondsSinceLastResend)} segundos antes de reenviar.`, waitSeconds: Math.ceil(60 - secondsSinceLastResend) });
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000);

      user.passwordRecoveryOtp = { code: otpCode, expiresAt: otpExpiration, attempts: 0, resends: (user.passwordRecoveryOtp?.resends || 0) + 1, lastResendAt: new Date() };
      await user.save();

      try {
        await sendRecoveryOtp({ code: otpCode, phone: user.phone, userName: user.name, chatId: user.telegram_chat_id });
        console.log(`✅ OTP de recuperación reenviado a Telegram para ${user.name}: ${otpCode}`);
      } catch (telegramError) {
        console.error('❌ Error reenviando OTP de recuperación:', telegramError);
        return res.status(500).json({ message: "Error al enviar el código de recuperación. Inténtalo de nuevo." });
      }

      res.status(200).json({ message: "Código de recuperación reenviado exitosamente. Revisa tu Telegram.", expiresIn: 600, resendsRemaining: 5 - user.passwordRecoveryOtp.resends });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  list_instructors: async (req, res) => {
    try {
      const instructors = await models.User.find({ rol: 'instructor', state: true })
        .select('name surname email slug avatar profession description facebook instagram youtube tiktok twitch website')
        .sort({ createdAt: -1 });
      console.log('✅ [list_instructors] Encontrados', instructors.length, 'instructores');
      console.log('🆔 [list_instructors] Slugs:', instructors.map(i => ({ name: i.name, slug: i.slug || 'SIN SLUG' })));
      res.status(200).send({ users: instructors });
    } catch (error) {
      console.error('❌ Error listando instructores:', error);
      res.status(500).send({ message: "Error al obtener la lista de instructores" });
    }
  },

  instructor_profile: async (req, res) => {
    try {
      const { slug } = req.params;
      let instructor;
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(slug);

      if (isMongoId) {
        console.log('🔍 [instructor_profile] Buscando por ID (legado):', slug);
        instructor = await models.User.findOne({ _id: slug, rol: 'instructor', state: true })
          .select('name surname email avatar profession description phone birthday socialMedia createdAt slug');
      } else {
        console.log('🔍 [instructor_profile] Buscando por slug:', slug);
        instructor = await models.User.findOne({ slug: slug, rol: 'instructor', state: true })
          .select('name surname email avatar profession description phone birthday socialMedia createdAt slug');
      }

      if (!instructor) {
        console.log('❌ [instructor_profile] Instructor no encontrado:', slug);
        return res.status(404).send({ message: "Instructor no encontrado" });
      }

      console.log('✅ [instructor_profile] Instructor encontrado:', instructor.name, instructor.surname);
      console.log('🆔 [instructor_profile] Slug actual:', instructor.slug || 'SIN SLUG');

      const courses = await models.Course.find({ user: instructor._id, state: 2 })
        .populate('categorie', 'title')
        .select('title subtitle slug imagen price_usd price_mxn level avg_rating count_class')
        .sort({ createdAt: -1 });

      const rawProjects = await models.Project.find({ user: instructor._id, state: 2 })
        .populate('categorie', 'title')
        .select('title subtitle imagen price_usd price_mxn description url_video state createdAt')
        .sort({ createdAt: -1 });

      console.log('✅ [instructor_profile] Proyectos públicos encontrados:', rawProjects.length);

      const projects = rawProjects.map(proj => ({
        _id: proj._id,
        title: proj.title,
        subtitle: proj.subtitle,
        imagen: proj.imagen,
        price_usd: proj.price_usd,
        price_mxn: proj.price_mxn || 0,
        description: proj.description || '',
        url_video: proj.url_video,
        categorie: proj.categorie,
        state: proj.state,
        createdAt: proj.createdAt
      }));

      res.status(200).send({ instructor: resource.User.api_resource_user(instructor), courses, projects });
    } catch (error) {
      console.error('❌ Error obteniendo perfil del instructor:', error);
      res.status(500).send({ message: "Error al obtener el perfil del instructor" });
    }
  },

  generate_otp_for_existing_user: async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: 400, message_text: "El ID del usuario es requerido" });

      const user = await models.User.findById(userId);
      if (!user) return res.status(404).json({ message: 404, message_text: "Usuario no encontrado" });
      if (!user.phone) return res.status(400).json({ message: 400, message_text: "El usuario no tiene teléfono registrado" });

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiration = new Date(Date.now() + 10 * 60 * 1000);

      user.otp = { code: otpCode, expiresAt: otpExpiration, attempts: 0, resends: 0, lastResendAt: new Date() };
      await user.save();

      try {
        await sendOtpCode({ code: otpCode, phone: user.phone, userName: user.name });
        console.log(`✅ OTP generado y enviado a Telegram para ${user.name}: ${otpCode}`);
      } catch (telegramError) {
        console.error('❌ Error enviando OTP:', telegramError);
        return res.status(500).json({ message: "Error al enviar el código. Verifica la configuración de Telegram." });
      }

      res.status(200).json({
        message: "Código OTP generado y enviado exitosamente. Revisa tu Telegram.",
        user: { _id: user._id, name: user.name, email: user.email, phone: user.phone },
        otpCode: otpCode, // Solo para testing
        expiresIn: 600
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "OCURRIO UN PROBLEMA" });
    }
  },

  delete_my_account: async (req, res) => {
    try {
      if (!req.user || !req.user._id) return res.status(401).send({ message: "No autenticado." });

      const userId = req.user._id;
      const { password } = req.body;

      if (!password) return res.status(400).json({ message: "Se requiere la contraseña para confirmar la eliminación." });

      const user = await models.User.findById(userId);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado." });

      const isMatch = bcrypt.compareSync(password, user.password);
      if (!isMatch) return res.status(403).json({ message: 403, message_text: "La contraseña es incorrecta. No se pudo eliminar la cuenta." });

      console.log(`🗑️ [Delete My Account] Usuario solicitando eliminación: ${user.email}`);

      if (user.avatar) {
        const imagePath = path.join(__dirname, "../uploads/user/", user.avatar);
        if (fs.existsSync(imagePath)) {
          try {
            fs.unlinkSync(imagePath);
            console.log(`   🖼️ Avatar eliminado: ${user.avatar}`);
          } catch (err) {
            console.error('   ⚠️ Error eliminando avatar:', err.message);
          }
        }
      }

      await models.User.findByIdAndDelete(userId);
      console.log(`✅ [Delete My Account] Cuenta eliminada permanentemente: ${user.email}`);
      res.status(200).json({ message: "Tu cuenta ha sido eliminada correctamente. Lamentamos verte partir." });
    } catch (error) {
      console.error('❌ [Delete My Account] Error:', error);
      res.status(500).send({ message: "Ocurrió un problema al eliminar tu cuenta." });
    }
  },
};
