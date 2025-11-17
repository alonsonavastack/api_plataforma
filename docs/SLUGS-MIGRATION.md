# 🆕 Sistema de Slugs para Perfiles de Usuario

## 📋 Resumen de Cambios

Se implementó un sistema de slugs únicos para los perfiles públicos de instructores y estudiantes, reemplazando las URLs con IDs por URLs amigables con slugs.

### Antes vs Después

**❌ Antes (con ID):**
```
http://localhost:4200/#/instructor/6908fee5719c05c6dede38f5
```

**✅ Después (con slug):**
```
http://localhost:4200/#/instructor/juan-perez
http://localhost:4200/#/instructor/maria-garcia
http://localhost:4200/#/instructor/carlos-rodriguez-2
```

---

## 🔧 Cambios Implementados

### Backend

1. **Modelo User** (`api/models/User.js`)
   - ✅ Campo `slug` agregado (único, lowercase, max 100 chars)
   - ✅ Index único para búsquedas rápidas
   - ✅ Sparse index para usuarios sin slug (migración gradual)

2. **Helper de Generación** (`api/helpers/slugGenerator.js`)
   - ✅ `normalizeToSlug()` - Normaliza texto a formato URL
   - ✅ `generateUniqueSlug()` - Genera slugs únicos con sufijos numéricos
   - ✅ `isValidSlug()` - Validación de formato
   - ✅ Manejo de duplicados automático (`juan-perez-2`, `juan-perez-3`)

3. **UserController** (`api/controllers/UserController.js`)
   - ✅ Generación automática de slug al registrar usuario
   - ✅ Endpoint `/instructor-profile/:slug` actualizado
   - ✅ Búsqueda por slug en lugar de ID

4. **Router** (`api/router/User.js`)
   - ✅ Ruta cambiada de `:id` a `:slug`

5. **Resource** (`api/resource/user/User.js`)
   - ✅ Campo `slug` incluido en respuesta de API

### Frontend

1. **Rutas** (`app.routes.ts`)
   - ✅ Ruta cambiada de `instructor/:id` a `instructor/:slug`

2. **Componente** (`instructor-profile.component.ts`)
   - ✅ Interface actualizada con campo `slug`
   - ✅ Lectura de parámetro `slug` en lugar de `id`
   - ✅ Petición HTTP usa slug

---

## 🚀 Migración de Usuarios Existentes

### Paso 1: Ejecutar Script de Migración

```bash
cd /Users/codfull-stack/Desktop/plataforma/api
node scripts/generate-user-slugs.js
```

**Salida esperada:**
```
🔄 Iniciando migración de slugs...

✅ Conectado a MongoDB

📊 Usuarios sin slug encontrados: 15

✅ [1/15] Juan Pérez → juan-perez
✅ [2/15] María García → maria-garcia
✅ [3/15] Carlos Rodríguez → carlos-rodriguez
✅ [4/15] Juan Pérez → juan-perez-2
✅ [5/15] Ana López → ana-lopez
...

📊 Resumen de migración:
   ✅ Exitosos: 15
   ❌ Errores: 0
   📝 Total procesados: 15

👋 Desconectado de MongoDB
🎉 Migración completada!
```

### Paso 2: Verificar en MongoDB

```bash
# Conectar a MongoDB
mongo

# Seleccionar base de datos
use tu_base_de_datos

# Verificar usuarios con slug
db.users.find({ slug: { $exists: true } }, { name: 1, surname: 1, slug: 1 })
```

### Paso 3: Reiniciar Backend y Frontend

```bash
# Backend
cd /Users/codfull-stack/Desktop/plataforma/api
# El backend debería reiniciarse automáticamente si usas nodemon

# Frontend
cd /Users/codfull-stack/Desktop/plataforma/cursos
# Angular CLI recarga automáticamente los cambios
```

---

## 📝 Ejemplos de Uso

### 1. Registrar Nuevo Usuario

Al registrar un usuario nuevo, el slug se genera automáticamente:

```javascript
// Request
POST /api/users/register
{
  "name": "Pedro",
  "surname": "Martínez",
  "email": "pedro@example.com",
  "password": "123456",
  // ... otros campos
}

// Response
{
  "user": {
    "_id": "...",
    "name": "Pedro",
    "surname": "Martínez",
    "slug": "pedro-martinez", // ✅ Generado automáticamente
    // ... otros campos
  }
}
```

### 2. Acceder al Perfil Público

```typescript
// En tu componente Angular
this.router.navigate(['/instructor', user.slug]); // ✅ Usar slug

// URL resultante
// http://localhost:4200/#/instructor/pedro-martinez
```

### 3. Manejo de Duplicados

Si ya existe `juan-perez`, el sistema automáticamente agrega sufijo:

```javascript
// Usuario 1
{ name: "Juan", surname: "Pérez", slug: "juan-perez" }

// Usuario 2 (mismo nombre)
{ name: "Juan", surname: "Pérez", slug: "juan-perez-2" }

// Usuario 3 (mismo nombre)
{ name: "Juan", surname: "Pérez", slug: "juan-perez-3" }
```

---

## 🔍 Validación y Testing

### 1. Verificar Slugs Únicos

```bash
# En MongoDB
db.users.aggregate([
  { $group: { _id: "$slug", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])

# Debe retornar array vacío (no hay duplicados)
```

### 2. Probar Endpoint

```bash
# Obtener perfil por slug
curl http://localhost:3000/api/users/instructor-profile/juan-perez

# Debe retornar datos del instructor
```

### 3. Probar Frontend

1. Navega a `http://localhost:4200/#/instructor/juan-perez`
2. Verifica que cargue el perfil correctamente
3. Copia la URL y ábrela en nueva pestaña
4. Comparte la URL con otra persona

---

## 🛠️ Troubleshooting

### Error: "Instructor no encontrado"

**Causa:** Usuario no tiene slug generado

**Solución:**
```bash
# Ejecutar script de migración
node scripts/generate-user-slugs.js
```

### Error: Duplicate key error (E11000)

**Causa:** Intento de crear slug duplicado

**Solución:** El sistema automáticamente agrega sufijo numérico. Si persiste:

```bash
# Regenerar índice único
db.users.dropIndex("slug_1")
db.users.createIndex({ slug: 1 }, { unique: true, sparse: true })
```

### Slugs con Caracteres Especiales

**Causa:** Nombres con emojis, símbolos especiales

**Solución:** El helper `normalizeToSlug()` los elimina automáticamente:

```javascript
"José María 🎓" → "jose-maria"
"Dr. López-García" → "dr-lopez-garcia"
```

---

## 🎯 Próximos Pasos

### Implementar para Estudiantes

El mismo sistema se puede usar para perfiles de estudiantes:

1. Agregar ruta `/student/:slug`
2. Crear componente `student-profile`
3. Reutilizar el mismo helper de slugs

### SEO y Open Graph

Para mejorar compartibilidad en redes sociales:

```html
<!-- Agregar meta tags en el componente -->
<meta property="og:url" content="https://tu-dominio.com/instructor/juan-perez">
<meta property="og:title" content="Juan Pérez - Instructor">
<meta property="og:description" content="Perfil profesional de Juan Pérez">
```

### Analytics

Trackear URLs por slug para métricas:

```typescript
// En el componente
ngOnInit(): void {
  const slug = this.route.snapshot.params['slug'];
  // Enviar a analytics
  gtag('event', 'page_view', {
    page_path: `/instructor/${slug}`,
    page_title: this.fullName()
  });
}
```

---

## 📚 Referencias

- **Generación de Slugs:** `api/helpers/slugGenerator.js`
- **Migración:** `api/scripts/generate-user-slugs.js`
- **Modelo:** `api/models/User.js`
- **Endpoint:** `api/controllers/UserController.js:instructor_profile`
- **Frontend:** `cursos/src/app/pages/instructor-profile/`

---

## ✅ Checklist de Implementación

- [x] Agregar campo `slug` al modelo User
- [x] Crear helper de generación de slugs
- [x] Actualizar UserController para generar slugs al registrar
- [x] Actualizar endpoint de perfil para buscar por slug
- [x] Actualizar ruta del router (`:id` → `:slug`)
- [x] Actualizar Resource para incluir slug en respuesta
- [x] Crear script de migración
- [x] Actualizar rutas del frontend
- [x] Actualizar componente de perfil
- [ ] **PENDIENTE:** Ejecutar migración en producción
- [ ] **PENDIENTE:** Implementar para estudiantes
- [ ] **PENDIENTE:** Agregar meta tags SEO

---

**Última actualización:** 03 de Noviembre, 2025
**Versión:** 2.1.0
