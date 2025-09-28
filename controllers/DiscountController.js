import models from "../models/index.js";

export default {
    register: async(req,res) => {
        try {
            const data = req.body;

            // Construir el filtro para la validación de superposición
            const filter = {
                type_campaign: data.type_campaign,
                // Condición de superposición de fechas: (StartA <= EndB) and (EndA >= StartB)
                start_date_num: { $lte: data.end_date_num },
                end_date_num: { $gte: data.start_date_num },
            };

            // Añadir filtro de segmento (cursos, categorías, proyectos) si aplica
            if (data.type_segment == 1) {
                filter.courses = { $in: data.courses_s };
            } else if (data.type_segment == 2) {
                filter.categories = { $in: data.categories_s };
            } else if (data.type_segment == 3) {
                filter.projects = { $in: data.projects_s };
            }

            const existingDiscount = await models.Discount.findOne(filter);

            if (existingDiscount) {
                res.status(200).json({
                    message: 403,
                    message_text: "EL DESCUENTO NO SE PUEDE REGISTRAR PORQUE HAY DUPLICIDAD"
                });
                return;
            }

            await models.Discount.create(data);

            res.status(200).json({
                message_text: "EL DESCUENTO SE REGISTRO CORRECTAMENTE",
            })
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "OCURRIO UN ERROR"
            });
        }
    },
    update: async(req,res) => {
        try {
            const data = req.body;

            // Construir el filtro para la validación de superposición, excluyendo el documento actual
            const filter = {
                type_campaign: data.type_campaign,
                _id: {$ne: data._id},
                // Condición de superposición de fechas
                start_date_num: { $lte: data.end_date_num },
                end_date_num: { $gte: data.start_date_num },
            };

            // Añadir filtro de segmento si aplica
            if (data.type_segment == 1) {
                filter.courses = { $in: data.courses_s };
            } else if (data.type_segment == 2) {
                filter.categories = { $in: data.categories_s };
            } else if (data.type_segment == 3) {
                filter.projects = { $in: data.projects_s };
            }

            const existingDiscount = await models.Discount.findOne(filter);

            if (existingDiscount) {
                res.status(200).json({
                    message: 403,
                    message_text: "EL DESCUENTO NO SE PUEDE REGISTRAR PORQUE HAY DUPLICIDAD"
                });
                return;
            }

            await models.Discount.findByIdAndUpdate({_id: data._id}, data);

            res.status(200).json({
                message_text: "EL DESCUENTO SE EDITO CORRECTAMENTE",
            })
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "OCURRIO UN ERROR"
            });
        }
    },
    list: async(req,res) => {
        try {

            const discounts = await models.Discount.find().sort({"createdAt": -1});

            res.status(200).json({
                discounts: discounts,
            })
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "OCURRIO UN ERROR"
            });
        }
    },
    show_discount: async(req,res) => {
        try {
            const discount_id = req.params.id;

            const discount = await models.Discount.findById({_id: discount_id});

            res.status(200).json({
                discount: discount
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "OCURRIO UN ERROR"
            });
        }
    },
    config_all: async(req,res) => {
        try {
            let courses = await models.Course.find({state: 2}).populate("categorie").lean();
            let categories = await models.Categorie.find({state : 1}).lean();
            let projects = await models.Project.find({state: 2}).populate("categorie").lean();

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
                    title:categorie.title,
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
                message: "OCURRIO UN ERROR"
            });
        }
    },
    remove: async(req,res) => {
        try {
            const discount_id = req.params.id;

            await models.Discount.findByIdAndDelete({_id: discount_id});

            res.status(200).json({
                message: "EL DESCUENTO SE HA ELIMINADO EXITOSAMENTE",
            });

        } catch (error) {
            console.log(error);
            res.status(500).send({
                message: "OCURRIO UN ERROR"
            });
        }
    },
}