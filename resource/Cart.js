export default {
    api_cart_list: (cart) => {
        const product_info = {
            _id: cart.product._id,
            title: cart.product.title,
            slug: cart.product.slug,
            imagen: `${process.env.URL_BACKEND}/api/${cart.product_type}s/imagen-${cart.product_type}/${cart.product.imagen}`,
            categorie: {
                _id: cart.product.categorie._id,
                title: cart.product.categorie.title,
            },
            price_soles: cart.product.price_soles,
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