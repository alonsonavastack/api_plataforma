import models from "../models/index.js";

// Crear cupón (Instructor)
export const create = async (req, res) => {
    try {
        const user = req.user;
        // Solo instructores pueden crear cupones (o admins)
        if (user.rol !== 'instructor' && user.rol !== 'admin') {
            return res.status(403).json({ message: 'No autorizado' });
        }

        const { project_id, product_type, days_duration } = req.body;

        if (!project_id || !days_duration) {
            return res.status(400).json({ message: 'Faltan datos requeridos (proyecto y duración)' });
        }

        // Validar que el proyecto pertenezca al instructor
        let product;
        if (product_type === 'project') {
            product = await models.Project.findOne({ _id: project_id, user: user._id });
        } else {
            product = await models.Course.findOne({ _id: project_id, user: user._id });
        }

        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado o no te pertenece' });
        }

        // Generar código único: REF-INSTRUCTOR-PRODUCT-RANDOM
        const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
        const code = `REF-${user.name.substring(0, 3).toUpperCase()}-${randomSuffix}`;

        // Calcular caducidad
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(days_duration));

        const coupon = await models.Coupon.create({
            code: code,
            instructor: user._id,
            projects: [project_id], // Por ahora array de 1
            expires_at: expiresAt,
            active: true,
            discount_percentage: 0 // Por defecto 0 (solo tracking), configurable a futuro
        });

        res.status(200).json({
            message: 'Cupón creado exitosamente',
            coupon: coupon
        });

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
            .populate('projects', 'title imagen') // Populate simple
            .sort({ createdAt: -1 });

        res.status(200).json({ coupons });
    } catch (error) {
        console.error('Error listing coupons:', error);
        res.status(500).json({ message: 'Error al listar cupones' });
    }
}


// Validar cupón (Público / Checkout)
export const validate = async (req, res) => {
    try {
        const { code, product_id } = req.body;

        if (!code || !product_id) {
            return res.status(400).json({ message: 'Código y producto requeridos', valid: false });
        }

        const coupon = await models.Coupon.findOne({
            code: code,
            active: true,
            expires_at: { $gt: new Date() } // Que no haya expirado
        });

        if (!coupon) {
            return res.status(404).json({ message: 'Cupón no válido o expirado', valid: false });
        }

        // Verificar si aplica al producto
        const applies = coupon.projects.some(p => p.toString() === product_id);

        if (!applies) {
            return res.status(400).json({ message: 'Este cupón no aplica para este proyecto', valid: false });
        }

        res.status(200).json({
            valid: true,
            coupon: {
                code: coupon.code,
                discount_percentage: coupon.discount_percentage,
                instructor: coupon.instructor
            },
            message: 'Cupón aplicado correctamente'
        });

    } catch (error) {
        console.error('Error validating coupon:', error);
        res.status(500).json({ message: 'Error de validación', valid: false });
    }
};
