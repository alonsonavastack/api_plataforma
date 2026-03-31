import models from "../models/index.js";

export default {
    register: async(req,res) => {
        try {
            
            const valid_cupone = await models.Coupon.findOne({code: req.body.code});

            if(valid_cupone){
                res.status(200).json({
                    message: 403,
                    message_text: "EL CODIGO DEL CUPON YA EXISTE",
                });
                return;
            }

            await models.Coupon.create(req.body);

            res.status(200).json({
                message_text: "EL CUPON SE REGISTRO CORRECTAMENTE",
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'Hubo un error'
            });
        }
    },
    update: async(req,res) => {
        try {
            const valid_cupone = await models.Coupon.findOne({
                code: req.body.code,
                _id: {$ne: req.body._id}
            });

            if(valid_cupone){
                res.status(200).json({
                    message: 403,
                    message_text: "EL CODIGO DEL CUPON YA EXISTE",
                });
                return;
            }

            await models.Coupon.findByIdAndUpdate({_id: req.body._id},req.body, {
                new: true
            });

            res.status(200).json({
                message_text: "EL CUPON SE ACTUALIZO CORRECTAMENTE",
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'Hubo un error'
            });
        }
    },
    list: async(req,res) => {
        try {
            const search = req.query.search;
            const state = req.query.state;
            const filter = {};

            if(search){
                filter.code = new RegExp(search, "i");
            }

            if(state){
                filter.state = state === 'true';
            }

            const cupones = await models.Coupon.find(filter).sort({"createdAt": -1});

            res.status(200).json({
                cupones: cupones,
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'Hubo un error'
            });
        }
    },
    show_cupone: async(req,res) => {
        try {
            const cupone_id = req.params.id ;
            const cupon = await models.Coupon.findOne({_id: cupone_id});

            res.status(200).json({
                cupon: cupon
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'Hubo un error'
            });
        }
    },
    config_all: async(req,res) => {
        try {
            
            const courses = await models.Course.find({state: 2}).populate("categorie");
            const categories = await models.Categorie.find({state : 1});
            const projects = await models.Project.find({state: 2}).populate("categorie");

            courses = courses.map((course) => {
                return {
                    _id: course._id,
                    title: course.title,
                    price_usd: course.price_usd,
                    imagen: course.imagen,
                    categorie: {
                        _id: course.categorie._id,
                        title: course.categorie.title,
                    },
                };
            })
            categories = categories.map((categorie) => {
                return {
                    _id: categorie._id,
                    title: categorie.title,
                    imagen: categorie.imagen,
                };
            })
            projects = projects.map((project) => {
                return {
                    _id: project._id,
                    title: project.title,
                    price_usd: project.price_usd,
                    imagen: project.imagen,
                    categorie: {
                        _id: project.categorie._id,
                        title: project.categorie.title,
                    },
                };
            })

            res.status(200).json({
                courses: courses,
                categories: categories,
                projects: projects,
            })
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'Hubo un error'
            });
        }
    },
    remove: async(req,res) => {
        try {
            const _id = req.params.id;
            await models.Coupon.findByIdAndDelete({_id: _id});

            res.status(200).json({
                message: "EL CUPON  SE HA ELIMINADO CORRECTAMENTE",
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: 'Hubo un error'
            });
        }
    },
}
