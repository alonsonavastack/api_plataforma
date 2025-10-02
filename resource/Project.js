export default {
    api_resource_project: (project) => {
        return {
            _id: project._id,
            title: project.title,
            subtitle: project.subtitle,
            description: project.description,
            imagen: project.imagen,
            url_video: project.url_video,
            categorie: project.categorie,
            price_mxn: project.price_mxn,
            price_usd: project.price_usd,
            state: project.state,
            user: project.user,
        }
    }
}
