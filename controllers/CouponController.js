import models from "../models/index.js";

// Crear cupón (Instructor)
export const create = async (req, res) => {
    try {
        const user = req.user;
        if (user.rol !== 'instructor' && user.rol !== 'admin') {
            return res.status(403).json({ message: 'No autorizado' });
        }

        const { project_id, product_type, days_duration } = req.body;

        if (!project_id || !days_duration) {
            return res.status(400).json({ message: 'Faltan datos requeridos (proyecto y duración)' });
        }

        // Validar que el producto pertenezca al instructor
        let product;
        if (product_type === 'project') {
            product = await models.Project.findOne({ _id: project_id, user: user._id });
        } else {
            product = await models.Course.findOne({ _id: project_id, user: user._id });
        }

        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado o no te pertenece' });
        }

        // Generar código único
        const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
        const code = `REF-${user.name.substring(0, 3).toUpperCase()}-${randomSuffix}`;

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(days_duration));

        const coupon = await models.Coupon.create({
            code,
            instructor: user._id,
            projects: [project_id],
            product_type: product_type || 'project',
            expires_at: expiresAt,
            active: true,
            discount_percentage: 0
        });

        // Devolver cupón con producto populado
        const couponObj = coupon.toObject();
        couponObj.projects = [{ ...product, _id: product._id }];

        res.status(200).json({ message: 'Cupón creado exitosamente', coupon: couponObj });

    } catch (error) {
        console.error('Error creating coupon:', error);
        res.status(500).json({ message: 'Error al crear cupón' });
    }
};

// Listar cupones del instructor
export const list = async (req, res) => {
    try {
        const user = req.user;
        const coupons = await models.Coupon.find({ instructor: user._id })
            .sort({ createdAt: -1 })
            .lean();

        // Populate manual según product_type (Mongoose no puede populate sin ref fijo en arrays)
        for (const coupon of coupons) {
            const populatedProjects = [];
            for (const productId of coupon.projects) {
                let product = null;
                if (coupon.product_type === 'course') {
                    product = await models.Course.findById(productId).select('title imagen slug').lean();
                } else {
                    product = await models.Project.findById(productId).select('title imagen slug').lean();
                }
                if (product) populatedProjects.push(product);
            }
            coupon.projects = populatedProjects;
        }

        res.status(200).json({ coupons });
    } catch (error) {
        console.error('Error listing coupons:', error);
        res.status(500).json({ message: 'Error al listar cupones' });
    }
};

// Validar cupón (Público / Checkout)
// 🔥 FIX: Busca el producto tanto en projects como en courses
export const validate = async (req, res) => {
    try {
        const { code, product_id } = req.body;

        if (!code || !product_id) {
            return res.status(400).json({ message: 'Código y producto requeridos', valid: false });
        }

        const coupon = await models.Coupon.findOne({
            code: code.trim().toUpperCase(),
            active: true,
            expires_at: { $gt: new Date() }
        });

        if (!coupon) {
            return res.status(404).json({ message: 'Cupón no válido o expirado', valid: false });
        }

        // 🔥 FIX: comparar con .toString() para ObjectIds
        const applies = coupon.projects.some(p => p.toString() === product_id.toString());

        if (!applies) {
            return res.status(400).json({
                message: 'Este cupón no aplica para este producto',
                valid: false
            });
        }

        res.status(200).json({
            valid: true,
            coupon: {
                _id: coupon._id,
                code: coupon.code,
                discount_percentage: coupon.discount_percentage,
                instructor: coupon.instructor
            },
            message: coupon.discount_percentage > 0
                ? `Cupón aplicado: ${coupon.discount_percentage}% de descuento`
                : 'Cupón de referido aplicado (80% para el instructor)'
        });

    } catch (error) {
        console.error('Error validating coupon:', error);
        res.status(500).json({ message: 'Error de validación', valid: false });
    }
};
