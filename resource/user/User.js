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
            // 🆕 REDES SOCIALES (desde socialMedia)
            facebook: user.socialMedia?.facebook,
            instagram: user.socialMedia?.instagram,
            youtube: user.socialMedia?.youtube,
            tiktok: user.socialMedia?.tiktok,
            twitch: user.socialMedia?.twitch,
            website: user.socialMedia?.website,
            discord: user.socialMedia?.discord,
            linkedin: user.socialMedia?.linkedin,
            twitter: user.socialMedia?.twitter,
            github: user.socialMedia?.github,
        }
    },
}