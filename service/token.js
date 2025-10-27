import jwt from 'jsonwebtoken'
import models from '../models/index.js'

export default {
    encode: async(_id, rol, email, type = 'auth') => {
        const payload = {
            _id: _id, 
            rol: rol, 
            email: email,
            type: type
        };
        
        // Diferentes tiempos de expiración según el tipo
        let expiresIn = process.env.JWT_EXPIRES_IN || '1d';
        if (type === 'password_recovery') {
            expiresIn = '15m'; // 15 minutos para recuperación de contraseña
        }
        
        const token = jwt.sign(payload, process.env.JWT_SECRETO, { expiresIn });
        return token;
    },
    decode: async(token) => {
        try {
            // jwt.verify es síncrono, no necesita await.
            const decoded = jwt.verify(token, process.env.JWT_SECRETO);
            
            // Si es un token de recuperación de contraseña, devolver solo los datos del token
            if (decoded.type === 'password_recovery') {
                return {
                    user_id: decoded._id,
                    rol: decoded.rol,
                    email: decoded.email,
                    type: decoded.type
                };
            }
            
            // Para tokens normales, buscar el usuario en la BD
            const user = await models.User.findOne({_id: decoded._id});
            if(user){
                return user;
            }
            return false;
        } catch (error) {
            console.log(error);
            return false;
        }
    }
}