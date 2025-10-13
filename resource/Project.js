function resource_project(project, discount_g = null, N_REVIEWS = 0, AVG_RATING = 0) {
    let final_price_usd = project.price_usd;
    let final_price_mxn = project.price_mxn;
    let discount_active = null;

    if (discount_g) {
        discount_active = {
            _id: discount_g._id,
            type_campaign: discount_g.type_campaign,
            type_discount: discount_g.type_discount,
            discount: discount_g.discount,
            end_date: discount_g.end_date,
        };
        if (discount_g.type_discount == 1) { // Porcentaje
            final_price_usd = parseFloat((final_price_usd - (final_price_usd * discount_g.discount * 0.01)).toFixed(2));
            final_price_mxn = parseFloat((final_price_mxn - (final_price_mxn * discount_g.discount * 0.01)).toFixed(2));
        } else { // Monto fijo
            final_price_usd = Math.max(0, parseFloat((final_price_usd - discount_g.discount).toFixed(2)));
            // Asumimos que el descuento fijo es en USD y se aplica de forma similar a MXN por simplicidad.
            final_price_mxn = Math.max(0, parseFloat((final_price_mxn - discount_g.discount).toFixed(2)));
        }
    }


    return {
        _id: project._id,
        title: project.title,
        subtitle: project.subtitle,
        description: project.description,
        imagen: project.imagen,
        url_video: project.url_video,
        categorie: project.categorie ? { _id: project.categorie._id, title: project.categorie.title } : null,
        price_mxn: project.price_mxn,
        price_usd: project.price_usd,
        final_price_mxn: final_price_mxn,
        final_price_usd: final_price_usd,
        state: project.state,
        user: project.user ? {
            _id: project.user._id,
            name: project.user.name,
            surname: project.user.surname,
            avatar: project.user.avatar,
        } : null,
        files: project.files,
        featured: project.featured,
        discount_active: discount_active,
        N_REVIEWS: N_REVIEWS,
        AVG_RATING: AVG_RATING,
    }
}

export default {
    api_resource_project: resource_project,
}
