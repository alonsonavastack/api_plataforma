# 🎬 Guía de Uso: Soporte de YouTube en Clases

## 📋 Cambios Implementados

### ✅ Backend
- ✅ Modelo `CourseClase` actualizado con campos `video_platform` y `video_id`
- ✅ Endpoint nuevo: `GET /api/course-clases/youtube-data?url=<youtube_url>`
- ✅ Compatibilidad con clases antiguas (campo `vimeo_id` se mantiene)
- ✅ Script de migración para actualizar datos existentes

### 📦 Campos del Modelo

```javascript
{
  video_platform: 'vimeo' | 'youtube',  // Plataforma del video
  video_id: String,                      // ID del video (genérico)
  vimeo_id: String,                      // DEPRECADO (solo compatibilidad)
  time: Number,                          // Duración en segundos
}
```

## 🚀 Cómo Usar

### 1. Migrar Datos Existentes (RECOMENDADO)

Ejecuta el script de migración para actualizar tus clases con Vimeo:

```bash
cd /Users/codfull-stack/Desktop/plataforma/api
node scripts/migrate-video-platform.js
```

Esto actualizará todas las clases que tienen `vimeo_id` para usar la nueva estructura.

### 2. Crear Clase con Vimeo

**Endpoint:** `POST /api/course-clases/register`

```json
{
  "title": "Introducción a Angular",
  "section": "507f1f77bcf86cd799439011",
  "video_platform": "vimeo",
  "video_id": "123456789",
  "time": 300,
  "description": "Primera clase del curso"
}
```

### 3. Crear Clase con YouTube

**Endpoint:** `POST /api/course-clases/register`

```json
{
  "title": "Introducción a React",
  "section": "507f1f77bcf86cd799439011",
  "video_platform": "youtube",
  "video_id": "dQw4w9WgXcQ",
  "time": 213,
  "description": "Primera clase del curso"
}
```

### 4. Obtener Duración de Video

#### Para Vimeo:
```http
GET /api/course-clases/vimeo-data?url=https://vimeo.com/123456789
```

**Respuesta:**
```json
{
  "duration": 300,
  "video_id": "123456789"
}
```

#### Para YouTube:
```http
GET /api/course-clases/youtube-data?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

**Respuesta:**
```json
{
  "duration": 213,
  "video_id": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up"
}
```

## 🔗 Formatos de URL Soportados

### Vimeo:
- `https://vimeo.com/123456789`
- `https://player.vimeo.com/video/123456789`

### YouTube:
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- `https://youtu.be/dQw4w9WgXcQ`
- `https://www.youtube.com/embed/dQw4w9WgXcQ`
- `https://www.youtube.com/v/dQw4w9WgXcQ`

## 🛠️ Frontend (Tareas Pendientes)

Para completar la integración, necesitas actualizar el frontend:

1. **Agregar selector de plataforma** en el formulario de creación/edición de clases
2. **Actualizar el servicio** para llamar al endpoint correcto según la plataforma
3. **Actualizar el reproductor** para mostrar YouTube o Vimeo según `video_platform`

### Ejemplo de Reproductor Condicional:

```typescript
// En el componente de reproducción de video
getVideoEmbedUrl(clase: CourseClase): SafeResourceUrl {
  if (clase.video_platform === 'youtube') {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${clase.video_id}`
    );
  } else {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://player.vimeo.com/video/${clase.video_id}`
    );
  }
}
```

## ⚠️ Notas Importantes

1. **No perderás datos**: El campo `vimeo_id` se mantiene por compatibilidad
2. **Compatibilidad total**: Clases antiguas seguirán funcionando
3. **API Key de YouTube**: Ya está configurada en `.env`
4. **Límites de YouTube API**: 10,000 unidades/día (cada petición = 1 unidad)

## 🧪 Pruebas

### Probar endpoint de YouTube:

```bash
curl "http://localhost:3000/api/course-clases/youtube-data?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Probar endpoint de Vimeo:

```bash
curl "http://localhost:3000/api/course-clases/vimeo-data?url=https://vimeo.com/123456789" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📞 Soporte

Si encuentras algún problema:
1. Verifica que `YOUTUBE_API_KEY` esté en `.env`
2. Revisa los logs del servidor
3. Verifica que la URL del video sea válida
4. Asegúrate de que el video sea público (no privado)

---

**Fecha de creación:** 24 de octubre de 2025
**Versión:** 1.0.0
