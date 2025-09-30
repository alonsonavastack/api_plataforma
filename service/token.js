import jwt from 'jsonwebtoken'
import models from '../models/index.js'

export default {
    encode: async(_id,rol,email) => {
        const token = jwt.sign({
            _id: _id, rol:rol,email:email
        }, process.env.JWT_SECRETO, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
        return  token;
    },
    decode: async(token) => {
        try {
            // jwt.verify es síncrono, no necesita await.
            const {_id} = jwt.verify(token, process.env.JWT_SECRETO);
            const user = await models.User.findOne({_id: _id});
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