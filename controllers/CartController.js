import models from "../models/index.js";
import resource from "../resource/index.js";
import token from "../service/token.js";

export default {
    register: async(req,res) => {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).send({ message: 'No autenticado.' });
            }
            // Verifica si el producto (sea curso o proyecto) ya está en el carrito del usuario.
            let CART_EXIST = await models.Cart.findOne({product: req.body.product, user: user._id});
            if(CART_EXIST){
                res.status(200).json({
                    message: 403,
                    message_text: 'EL PRODUCTO YA SE AGREGO A SU CARRITO'
                });
                return;
            }
            req.body.user = user._id;
            let Cart = await models.Cart.create(req.body);

            // Popula el producto (sea curso o proyecto) y su categoría.
            let NewCart = await models.Cart.findById({_id: Cart._id}).populate({
                path: 'product',
                populate: {
                    path: "categorie"
                }
            });

            res.status(200).json({
                cart: resource.Cart.api_cart_list(NewCart),
                message_text: 'EL PRODUCTO SE AGREGO CORRECTAMENTE'
            });
        } catch (error) {
            console.log(error); 
            res.status(500).send({
                message: 'OCURRIO UN ERROR',
            })
        }
    },
    update: async(req,res) => {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).send({ message: 'No autenticado.' });
            }
            let CUPON = await models.Cupone.findOne({code: req.body.cupon});
            if(!CUPON){
                res.status(200).json({
                    message: 403,
                    message_text: "EL CODIGO DEL CUPON NO EXISTE",
                });
                return;
            }
            let carts = await models.Cart.find({user: user._id}).populate("product");

            // Mapea los IDs del cupón para una búsqueda más eficiente
            const couponCourses = CUPON.courses.map(c => c.toString());
            const couponProjects = CUPON.projects.map(p => p.toString());
            const couponCategories = CUPON.categories.map(cat => cat.toString());

            for (const cart of carts) {
                let applies = false;

                // Verifica si el cupón aplica al producto o a su categoría
                if (cart.product_type === 'course' && couponCourses.includes(cart.product._id.toString())) {
                    applies = true;
                }
                if (cart.product_type === 'project' && couponProjects.includes(cart.product._id.toString())) {
                    applies = true;
                }
                if (cart.product.categorie && couponCategories.includes(cart.product.categorie.toString())) {
                    applies = true;
                }

                if (applies) {
                    let subtotal = 0;
                    let total = 0;

                    if (CUPON.type_discount == 1) { // Porcentaje
                        subtotal = cart.price_unit - cart.price_unit * (CUPON.discount * 0.01);
                    } else { // Monto fijo
                        subtotal = cart.price_unit - CUPON.discount;
                    }
                    total = subtotal < 0 ? 0 : subtotal; // Asegurarse de que el total no sea negativo

                    await models.Cart.findByIdAndUpdate(cart._id, {
                        subtotal: total,
                        total: total,
                        type_discount: CUPON.type_discount,
                        discount: CUPON.discount,
                        code_cupon: req.body.cupon,
                        campaign_discount: null,
                        code_discount: null,
                    });
                }
            }

            // Devuelve la lista de carritos actualizada
            let newCarts = await models.Cart.find({user: user._id}).populate({
                path: 'product',
                populate: {
                    path: "categorie"
                }
            });

            newCarts = newCarts.map((cart) => {
                return resource.Cart.api_cart_list(cart);
            });
            res.status(200).json({
                carts: newCarts,
                message: 200,
                message_text: "EL CUPON SE APLICADO CORRECTAMENTE"
            });
        } catch (error) {
            console.log(error); 
            res.status(500).send({
                message: 'OCURRIO UN ERROR',
            })
        }
    },
    list: async(req,res) => { 
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).send({ carts: [] }); // Devuelve carrito vacío si no está autenticado
            }
            
            let CARTS = await models.Cart.find({user: user._id}).populate({
                path: 'product',
                populate: {
                    path: "categorie"
                }
            });

            CARTS = CARTS.map((cart) => {
                return resource.Cart.api_cart_list(cart);
            });
            
            res.status(200).json({
                carts: CARTS,
            })
        } catch (error) {
            console.log(error); 
            res.status(500).send({
                message: 'OCURRIO UN ERROR',
            })
        }
    },
    remove: async(req,res) => {
        try {
            let ID = req.params.id;
            let CART = await models.Cart.findByIdAndRemove({_id: ID});

            res.status(200).json({
                message: 'EL PRODUCTO SE HA ELIMINADO DEL CARRITO DE COMPRA'
            });
        } catch (error) {
            console.log(error); 
            res.status(500).send({
                message: 'OCURRIO UN ERROR',
            })
        }
    },
}