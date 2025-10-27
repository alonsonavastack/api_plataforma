export default {
    api_resource_user: (user) => {
        return {
            _id: user._id,
            name:user.name,
            surname:user.surname,
            email:user.email,
            phone: user.phone,
            profession:user.profession,
            description:user.description,
            rol:user.rol,
            state: user.state,
            avatar: user.avatar,
        }
    },
}