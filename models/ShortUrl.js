import mongoose, { Schema } from "mongoose";

const ShortUrlSchema = new Schema({
  // ID corto único (ej: "abc123")
  shortCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 10
  },
  
  // URL original completa
  originalUrl: {
    type: String,
    required: true,
    trim: true
  },
  
  // Tipo de recurso (para estadísticas)
  resourceType: {
    type: String,
    enum: ['instructor', 'course', 'project', 'other'],
    default: 'other'
  },
  
  // ID del recurso (opcional, para referencia)
  resourceId: {
    type: Schema.ObjectId,
    required: false
  },
  
  // Usuario que creó el enlace (opcional)
  createdBy: {
    type: Schema.ObjectId,
    ref: 'user',
    required: false
  },
  
  // Estadísticas
  clicks: {
    type: Number,
    default: 0
  },
  
  // Último acceso
  lastAccessedAt: {
    type: Date,
    default: null
  },
  
  // Fecha de expiración (opcional)
  expiresAt: {
    type: Date,
    required: false
  },
  
  // Activo/Inactivo
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Índices para búsquedas rápidas
ShortUrlSchema.index({ shortCode: 1 });
ShortUrlSchema.index({ resourceType: 1, resourceId: 1 });
ShortUrlSchema.index({ createdBy: 1 });

const ShortUrl = mongoose.model("short_url", ShortUrlSchema);

export default ShortUrl;
