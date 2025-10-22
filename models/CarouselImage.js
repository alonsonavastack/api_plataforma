import mongoose from 'mongoose';

const CarouselImageSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'El título es obligatorio'] },
    subtitle: { type: String }, // Opcional
    imageUrl: { type: String, required: [true, 'El nombre del archivo de imagen es obligatorio'] },
    linkUrl: { type: String }, // Opcional, para redirigir a un curso, etc.
    order: { type: Number, default: 0, index: true }, // Para definir el orden de aparición
    isActive: { type: Boolean, default: true, index: true }, // Para activar/desactivar sin eliminar
}, {
    timestamps: true // Agrega createdAt y updatedAt automáticamente
});

const CarouselImage = mongoose.model('CarouselImage', CarouselImageSchema);

export default CarouselImage;