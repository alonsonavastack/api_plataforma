import mongoose, { Schema } from "mongoose";

const CourseSchema = new Schema({
    title: { type: String, maxlength: 250, required: true },
    slug: { type: String, required: true },
    subtitle: { type: String, required: true },
    categorie: { type: Schema.ObjectId, ref: 'categorie', required: true },
    price_mxn: { type: Number, required: true },
    // price_usd removed as per requirement
    isFree: { type: Boolean, default: false }, // Indica si el curso es gratuito
    imagen: { type: String, maxlength: 250, required: true },
    description: { type: String, required: true },
    vimeo_id: { type: String, required: false },
    state: { type: Number, default: 1 }, // 1 es borrador, 2 es publico, 3 es anulado
    user: { type: Schema.ObjectId, ref: 'user', required: true },
    level: { type: String, required: true },
    idioma: { type: String, required: true },
    requirements: [{ type: String, required: true }],//["ANGULAR BAISCO","LARAVEL BASICO"]
    who_is_it_for: [{ type: String, required: true }],
    featured: { type: Boolean, default: false }, // Campo para destacar el curso
}, {
    timestamps: true
});

// 🔧 FIX: Índice de texto para búsqueda full-text
// Los índices text NO soportan collation, pero tienen su propia normalización integrada
CourseSchema.index(
    { title: 'text', subtitle: 'text', description: 'text' },
    {
        name: 'search_text_index',
        background: true,
        default_language: 'spanish'  // Usa stemming y stop words en español
    }
);

// 🔧 Normalizar slug al guardar
CourseSchema.pre('save', function (next) {
    // Normalizar el slug (sin tildes, minúsculas, guiones)
    if (this.isModified('title') && !this.slug) {
        this.slug = this.title
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remover tildes
            .replace(/[^a-z0-9]+/g, '-')     // Reemplazar espacios y caracteres especiales
            .replace(/^-+|-+$/g, '');         // Remover guiones al inicio/fin
    }
    next();
});

const Course = mongoose.model("course", CourseSchema);

// 🔧 Crear índices al inicializar el modelo
Course.createIndexes().then(() => {
    console.log('✅ Course indexes created successfully');
}).catch(err => {
    // 🔧 Silenciar error de sesión expirada al reiniciar
    if (err.name !== 'MongoExpiredSessionError') {
        console.error('❌ Error creating Course indexes:', err);
    }
});

export default Course;
