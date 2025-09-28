export default {
    api_resource_categorie: (categorie) => {
        return {
            _id: categorie._id,
            title: categorie.title,
            imagen: categorie.imagen ? `${process.env.URL_BACKEND}/api/categories/imagen-categorie/${categorie.imagen}` : null,
            state: categorie.state,
        }
    },
}