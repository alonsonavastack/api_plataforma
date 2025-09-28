import token from './token.js'

const verifyAuth = async (req, res, next, allowedRoles) => {
    if(!req.headers.token){
        return res.status(401).send({ // 401 Unauthorized es más apropiado para un token faltante
            message: 'NO SE ENVIÓ EL TOKEN',
        });
    }
    const response = await token.decode(req.headers.token);
    if(response){
        if(allowedRoles.includes(response.rol)){
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
        await verifyAuth(req, res, next, ['cliente', 'admin']);
    },
    verifyAdmin: async(req,res,next) => {
        await verifyAuth(req, res, next, ['admin']);
    },
    verifyDashboard: async(req,res,next) => {
        await verifyAuth(req, res, next, ['admin', 'instructor']);
    }
}