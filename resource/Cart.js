export default {
    api_cart_list: (cart) => {
        // Construye la URL de la imagen correctamente dependiendo del tipo de producto.
        const imagePath = cart.product_type === 'project' 
            ? `project/imagen-project/${cart.product.imagen}` 
            : `courses/imagen-course/${cart.product.imagen}`;

        const product_info = {
            _id: cart.product._id,
            title: cart.product.title,
            slug: cart.product.slug,
            imagen: `${process.env.URL_BACKEND}/api/${imagePath}`,
            categorie: {
                _id: cart.product.categorie._id,
                title: cart.product.categorie.title,
            },
            price_mxn: cart.product.price_mxn,
            price_usd: cart.product.price_usd,
        };

        return {
            _id: cart._id,
            user: cart.user,
            product: product_info,
            product_type: cart.product_type,
            type_discount: cart.type_discount,
            discount: cart.discount,
            campaign_discount: cart.campaign_discount,
            code_cupon: cart.code_cupon,
            code_discount: cart.code_discount,
            price_unit: cart.price_unit,
            subtotal: cart.subtotal,
            total: cart.total,
        }
    },
}