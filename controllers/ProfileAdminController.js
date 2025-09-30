import models from "../models/index.js";
// No es necesario importar 'token.js' porque el middleware ya hizo la verificación.

export default {
  profile: async (req, res) => {
    try {
      // El middleware 'verifyAdmin' ya validó el token y adjuntó el usuario a 'req.user'.
      // Simplemente usamos ese objeto.
      const userFromToken = req.user;

      const adminProfile = await models.User.findById(userFromToken._id);

      if (!adminProfile) {
        return res.status(404).send({ message: "Usuario no encontrado." });
      }

      res.status(200).json({
        profile: adminProfile,
      });
    } catch (error) {
      console.error("Error en ProfileAdminController.profile:", error);
      res.status(500).send({ message: "OCURRIÓ UN ERROR" });
    }
  },
}