import token from './token.js'

const verifyAuth = async (req, res, next, allowedRoles) => {
    // Estandarizar la lectura del token desde el encabezado 'Authorization'
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).send({
            message: 'No se proporcionó un token de autenticación.',
        });
    }

    const tokenValue = authHeader.split(' ')[1];
    if (!tokenValue) {
        return res.status(401).send({ message: 'Formato de token inválido. Se esperaba "Bearer <token>".' });
    }
    const response = await token.decode(tokenValue);
    if (response) {
        if(allowedRoles.includes(response.rol)){
            req.user = response; // Adjuntamos el usuario decodificado a la petición
            next();
        }else{
            res.status(403).send({
                message: 'NO ESTA PERMITIDO VISITAR ESTA PÁGINA',
            });
        }
    }else{
        res.status(403).send({
            message: 'EL TOKEN ES INVÁLIDO',
        });
    }
};

export default {
    verifyTienda: async(req,res,next) => {
        await verifyAuth(req, res, next, ['cliente', 'admin', 'instructor']);
    },
    verifyAdmin: async(req,res,next) => {
        await verifyAuth(req, res, next, ['admin']);
    },
    verifyInstructor: async(req,res,next) => {
        await verifyAuth(req, res, next, ['instructor']);
    },
    verifyDashboard: async(req,res,next) => {
        await verifyAuth(req, res, next, ['admin', 'instructor']);
    },
    verifyToken: async(req,res,next) => {
        await verifyAuth(req, res, next, ['cliente', 'admin', 'instructor']);
    }
}
