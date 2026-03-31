# 🔄 Migración de Reembolsos a 100%

## Objetivo
Actualizar todos los reembolsos existentes en la base de datos para que reflejen el 100% del monto original, ya que ahora el sistema acredita el total a la billetera digital sin deducciones.

## ⚠️ Importante
Ejecuta esta migración **UNA SOLA VEZ** después de actualizar el código del modelo `Refund.js`.

## 📋 Pasos para ejecutar

### 1. Asegúrate de que el backend esté actualizado
```bash
cd /Users/codfull-stack/Desktop/plataforma/api
```

### 2. Verifica que MongoDB esté corriendo
```bash
# Si usas MongoDB local
mongosh
# O verifica tu conexión a MongoDB Atlas
```

### 3. Ejecuta la migración
```bash
cd migrations
node update-refunds-to-100.js
```

### 4. Verifica los resultados
La migración mostrará:
- ✅ Número de reembolsos actualizados
- ⏭️ Número de reembolsos omitidos (ya estaban al 100%)
- 📊 Total de reembolsos procesados

## 🔍 Qué hace la migración

1. Conecta a la base de datos
2. Busca todos los reembolsos activos (state: 1)
3. Para cada reembolso:
   - Verifica el monto actual
   - Si no está al 100%, recalcula con la nueva lógica
   - Actualiza: `refundAmount = originalAmount` y `refundPercentage = 100`
   - Guarda los cambios

## 📊 Ejemplo de cambio

**Antes:**
```
Original: $10.00
Reembolso: $7.82 (78.2%)
```

**Después:**
```
Original: $10.00
Reembolso: $10.00 (100%)
```

## ✅ Verificación

Después de ejecutar la migración:

1. **En la base de datos:**
   ```javascript
   db.refunds.find({}).forEach(r => {
     print(`${r._id}: ${r.calculations.refundAmount} (${r.calculations.refundPercentage}%)`)
   })
   ```

2. **En la interfaz:**
   - Ve a Dashboard → Solicitudes de Reembolso
   - Verifica que todos los montos muestren el 100%

## 🚨 Troubleshooting

### Error de conexión a MongoDB
```bash
# Verifica la variable de entorno
echo $MONGODB_URI

# O edita el script y cambia manualmente la URI
```

### Error "Cannot find module"
```bash
# Asegúrate de estar en el directorio correcto
cd /Users/codfull-stack/Desktop/plataforma/api/migrations
pwd
```

### Los cambios no se reflejan
```bash
# Reinicia el backend después de la migración
cd ..
npm run dev
```

## 📝 Notas

- Esta migración es **idempotente**: puedes ejecutarla múltiples veces sin problemas
- Solo actualiza reembolsos que no estén al 100%
- No modifica reembolsos ya completados o rechazados (mantiene su historial)
- Guarda los datos históricos de comisiones para referencia

## ⏭️ Siguiente paso

Después de ejecutar la migración:
1. Reinicia el backend
2. Recarga el frontend (Hard Reload)
3. Verifica la tabla de reembolsos
