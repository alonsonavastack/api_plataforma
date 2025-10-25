# 🎯 Pasos para Activar Soporte de YouTube

## ✅ Cambios Realizados

Se han implementado los siguientes cambios en el backend:

1. ✅ **Modelo actualizado** (`CourseClase.js`)
   - Nuevos campos: `video_platform` y `video_id`
   - Campo legacy: `vimeo_id` (para compatibilidad)

2. ✅ **Controlador actualizado** (`CourseClaseController.js`)
   - Nuevo endpoint: `get_youtube_data`
   - Parser de duración ISO 8601
   - Soporte para múltiples formatos de URL

3. ✅ **Router actualizado** (`CourseClase.js`)
   - Nueva ruta: `GET /youtube-data`

4. ✅ **Script de migración** (`scripts/migrate-video-platform.js`)
   - Migra datos existentes de Vimeo a nueva estructura

5. ✅ **Documentación** (`docs/YOUTUBE_SUPPORT.md`)
   - Guía completa de uso

---

## 🚀 Pasos de Activación

### 1. Reiniciar el Servidor Backend

```bash
cd /Users/codfull-stack/Desktop/plataforma/api

# Detener el servidor actual (Ctrl+C)
# Iniciar nuevamente
npm start
# o
node app.js
```

### 2. Ejecutar Script de Migración (OPCIONAL pero RECOMENDADO)

Este paso migrará tus clases existentes con Vimeo a la nueva estructura:

```bash
cd /Users/codfull-stack/Desktop/plataforma/api
node scripts/migrate-video-platform.js
```

**Salida esperada:**
```
🚀 Iniciando migración de plataformas de video...

✅ Conectado a MongoDB

📊 Total de clases con vimeo_id: 15

✅ Migración completada:
   - Clases actualizadas: 15
   - Clases ya migradas: 0

📈 Estado actual:
   - Clases con Vimeo: 15
   - Clases con YouTube: 0
   - Total: 15

✅ Desconectado de MongoDB
🎉 Migración finalizada con éxito
```

### 3. Verificar que YouTube API Key está en .env

Abre el archivo `.env` y verifica que existe esta línea:

```bash
YOUTUBE_API_KEY=AIzaSyAvDHhz8AkBp-SaQFcA_z_jbJJPLcbQMkg
```

✅ **Ya está configurada** - No necesitas hacer nada

---

## 🧪 Probar el Nuevo Endpoint

### Opción A: Usar cURL

```bash
# Reemplaza YOUR_TOKEN con un token JWT válido
curl "http://localhost:3000/api/course-clases/youtube-data?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Respuesta esperada:**
```json
{
  "duration": 213,
  "video_id": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up (Official Video)"
}
```

### Opción B: Usar Postman/Thunder Client

1. **Método:** GET
2. **URL:** `http://localhost:3000/api/course-clases/youtube-data?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ`
3. **Headers:**
   - `Authorization: Bearer YOUR_TOKEN`
4. **Enviar**

### Opción C: Usar el Script de Prueba

```bash
cd /Users/codfull-stack/Desktop/plataforma/api

# Hacer el script ejecutable
chmod +x scripts/test-video-endpoints.sh

# Editar el script y agregar tu token
nano scripts/test-video-endpoints.sh
# Reemplaza: TOKEN="YOUR_AUTH_TOKEN_HERE"

# Ejecutar
./scripts/test-video-endpoints.sh
```

---

## 📝 Próximos Pasos (Frontend)

El backend ya está listo. Ahora necesitas actualizar el **frontend** para:

### 1. Agregar Selector de Plataforma

En el formulario de crear/editar clase, agregar:

```html
<select [(ngModel)]="clase.video_platform">
  <option value="vimeo">Vimeo</option>
  <option value="youtube">YouTube</option>
</select>
```

### 2. Llamar al Endpoint Correcto

```typescript
getVideoDuration(url: string, platform: 'vimeo' | 'youtube') {
  const endpoint = platform === 'youtube' 
    ? '/api/course-clases/youtube-data'
    : '/api/course-clases/vimeo-data';
    
  return this.http.get(`${this.apiUrl}${endpoint}?url=${url}`);
}
```

### 3. Actualizar el Reproductor

```typescript
getVideoEmbedUrl(clase: CourseClase): SafeResourceUrl {
  let url = '';
  
  if (clase.video_platform === 'youtube') {
    url = `https://www.youtube.com/embed/${clase.video_id}`;
  } else {
    // Vimeo o compatibilidad con vimeo_id
    const videoId = clase.video_id || clase.vimeo_id;
    url = `https://player.vimeo.com/video/${videoId}`;
  }
  
  return this.sanitizer.bypassSecurityTrustResourceUrl(url);
}
```

---

## 🔍 Verificación de Funcionamiento

### ✅ Checklist de Verificación

- [ ] Servidor backend reiniciado
- [ ] Script de migración ejecutado (opcional)
- [ ] Endpoint `/youtube-data` responde correctamente
- [ ] Variables de entorno configuradas (`.env`)
- [ ] Modelos actualizados en MongoDB

### 🧪 URLs de Prueba

**YouTube válidos:**
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (Rick Roll - 213 seg)
- `https://www.youtube.com/watch?v=9bZkp7q19f0` (Gangnam Style - ~253 seg)
- `https://youtu.be/dQw4w9WgXcQ` (Formato corto)

**Vimeo válidos:**
- Necesitas IDs de videos que existan en tu cuenta o públicos

---

## ❓ Solución de Problemas

### Error: "YOUTUBE_API_KEY no está configurado"

**Solución:** Verifica que el archivo `.env` tenga la línea:
```
YOUTUBE_API_KEY=AIzaSyAvDHhz8AkBp-SaQFcA_z_jbJJPLcbQMkg
```

### Error: "Video no encontrado en YouTube"

**Posibles causas:**
1. El video es privado o fue eliminado
2. El ID del video es incorrecto
3. La URL no está bien formada

### Error: "Error de autenticación con YouTube API"

**Solución:** 
1. Verifica que la API Key sea válida
2. Asegúrate de que YouTube Data API v3 esté habilitada en Google Cloud Console
3. Verifica que no hayas excedido el límite de cuota (10,000 unidades/día)

### Error: Cannot find module 'axios'

**Solución:**
```bash
cd /Users/codfull-stack/Desktop/plataforma/api
npm install axios
```

---

## 📊 Estructura de Datos

### Antes (Solo Vimeo):
```json
{
  "_id": "...",
  "title": "Clase 1",
  "vimeo_id": "123456789",
  "time": 300
}
```

### Después (Vimeo o YouTube):
```json
{
  "_id": "...",
  "title": "Clase 1",
  "video_platform": "youtube",
  "video_id": "dQw4w9WgXcQ",
  "time": 213,
  "vimeo_id": null  // Campo legacy
}
```

---

## 📞 Contacto

Si tienes dudas o problemas:
1. Revisa los logs del servidor: `console.log` en el backend
2. Verifica la respuesta del endpoint en DevTools
3. Consulta la documentación completa en `/docs/YOUTUBE_SUPPORT.md`

---

**Fecha:** 24 de octubre de 2025  
**Estado:** ✅ Listo para usar  
**Versión:** 1.0.0
