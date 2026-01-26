import mongoose, { Schema } from "mongoose";

const SystemConfigSchema = Schema({
  // Información Básica
  siteName: {
    type: String,
    required: true,
    default: 'NeoCourse'
  },
  siteDescription: {
    type: String,
    default: 'Plataforma de Cursos Online'
  },
  logo: {
    type: String,
    default: null
  },
  favicon: {
    type: String,
    default: null
  },

  // Contacto
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    default: ''
  },
  supportEmail: {
    type: String,
    default: ''
  },

  // Redes Sociales
  socialMedia: {
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' },
    youtube: { type: String, default: '' },
    tiktok: { type: String, default: '' },
    twitch: { type: String, default: '' },
    twitter: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    website: { type: String, default: '' }
  },

  // Configuración SEO
  metaKeywords: {
    type: String,
    default: ''
  },
  metaDescription: {
    type: String,
    default: ''
  },

  // Configuración de Sistema
  maintenanceMode: {
    type: Boolean,
    default: false
  },
  allowRegistrations: {
    type: Boolean,
    default: true
  },

  // Copias de Seguridad
  backup: {
    enabled: { type: Boolean, default: false },
    lastBackup: { type: Date, default: null }
  },

  // 📝 Notas de Respaldo
  backup_notes: {
    type: String,
    default: ''
  },

  // Módulos del Sistema
  modules: {
    courses: { type: Boolean, default: true }, // Activar/Desactivar módulo de cursos
  },

  // Auditoría
  updatedBy: {
    type: Schema.ObjectId,
    ref: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware para actualizar updatedAt
SystemConfigSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const SystemConfig = mongoose.model('system_config', SystemConfigSchema);
export default SystemConfig;
