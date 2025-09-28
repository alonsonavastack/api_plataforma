export default {
    api_resource_project: (project) => {
        return {
            _id: project._id,
            title: project.title,
            subtitle: project.subtitle,
            description: project.description,
            imagen: project.imagen ? `${process.env.URL_BACKEND}/api/projects/imagen-project/${project.imagen}` : null,
            categorie: project.categorie,
            price_soles: project.price_soles,
            price_usd: project.price_usd,
            state: project.state,
        }
    }
}