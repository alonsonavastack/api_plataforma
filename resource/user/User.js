export default {
    api_resource_user: (user) => {
        return {
            _id: user._id,
            name: user.name,
            surname: user.surname,
            email: user.email,
            phone: user.phone,
            profession: user.profession,
            description: user.description,
            rol: user.rol,
            state: user.state,
            // ✅ Avatar: puede ser un nombre de archivo local O una URL externa (Google, etc.)
            // El frontend detecta automáticamente cuál es cuál
            avatar: user.avatar || null,
            // ✅ Proveedor de autenticación (útil para el perfil)
            auth_provider: user.auth_provider || 'local',
            slug: user.slug,
            // ✅ REDES SOCIALES (desde socialMedia)
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
            createdAt: user.createdAt,
        }
    },
}
