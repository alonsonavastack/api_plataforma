# 🗑️ Módulos Deprecados - NeoCourse

Este directorio contiene módulos que han sido removidos del sistema principal pero se mantienen como backup por seguridad.

---

## 📦 Módulo: Cupones (Coupon)

**Fecha de eliminación:** 18 de Octubre, 2025  
**Razón:** 0% de implementación en frontend, duplica funcionalidad con módulo de Descuentos  
**Estado:** ❌ Completamente deprecado y removido

### Archivos Respaldados:
- `CuponeController.js` - Controlador del backend
- `Coupon.router.js` - Router principal
- `Cupone.router.js` - Router alternativo
- `Cupone.model.js` - Modelo de MongoDB

### Endpoints que existían:
```
POST   /api/coupon/register      - Crear cupón
POST   /api/coupon/update        - Actualizar cupón
GET    /api/coupon/list          - Listar cupones
GET    /api/coupon/show/:id      - Mostrar cupón
GET    /api/coupon/config_all    - Configuración
DELETE /api/coupon/remove/:id    - Eliminar cupón
```

### ¿Por qué se eliminó?

1. **0% de uso en frontend** - Ningún servicio Angular lo implementaba
2. **Duplicidad** - El módulo de Descuentos cumple la misma función
3. **Confusión** - Generaba dudas sobre cuál usar
4. **Mantenimiento** - Código muerto que consumía recursos

### ¿Qué usar en su lugar?

**Módulo de Descuentos (`/api/discount`)**
- ✅ 100% implementado en frontend
- ✅ Más completo y robusto
- ✅ Soporta campañas normales y flash
- ✅ Segmentación por cursos, categorías o todos
- ✅ Descuentos por porcentaje o monto fijo

### ¿Se puede restaurar?

Sí, pero **NO es recomendable**. Si necesitas esta funcionalidad:

1. **Mejor opción:** Usar y mejorar el módulo de Descuentos
2. **Si realmente necesitas cupones:**
   - Restaurar archivos desde este backup
   - Actualizar `router/index.js`
   - Actualizar `models/index.js`
   - Implementar en frontend (crear servicio y componentes)

### Datos en MongoDB

La colección `coupons` puede seguir existiendo en la base de datos.

**Para eliminarla permanentemente:**
```bash
mongosh mongodb://localhost:27017/plataforma_cursos
> db.coupons.drop()
```

**⚠️ ADVERTENCIA:** Esto eliminará TODOS los cupones de forma permanente.

---

## 📋 Historial de Cambios

### v1.0 - 18 de Octubre, 2025
- ✅ Módulo de Cupones movido a deprecados
- ✅ Referencias comentadas en router/index.js
- ✅ Referencias comentadas en models/index.js
- ✅ Archivos respaldados en _deprecated_modules/coupon_module/
- ✅ Sistema continúa funcionando con módulo de Descuentos

---

## 🔍 Verificación Post-Eliminación

### ✅ Checklist Completado:
- [x] Backend inicia sin errores
- [x] Frontend compila correctamente
- [x] Login funciona
- [x] Dashboard carga
- [x] Cursos funcionan
- [x] Proyectos funcionan
- [x] Descuentos funcionan (reemplazo de cupones)
- [x] Ventas se procesan correctamente

### 📊 Resultado:
**Sistema funcionando al 100%** sin el módulo de cupones.

---

**Responsable:** Equipo NeoCourse  
**Backup creado:** 18 de Octubre, 2025  
**Próxima revisión:** Eliminar permanentemente después de 3 meses si no hay problemas
