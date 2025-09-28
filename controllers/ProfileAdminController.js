import models from "../models/index.js";
import token from "../service/token.js";

export default {
    profile: async(req,res) => {
        try {
            const user = await token.decode(req.headers.token);
            const admin = await models.User.findById(user._id);

            res.status(200).json({
                profile: {
                    name: admin.name,
                    surname: admin.surname,
                    email: admin.email,
                    avatar: admin.avatar,
                }
            });
        } catch (error) {
            res.status(500).send({ message: 'HUBO UN ERROR' });
        }
    },
}