# 🌍 SISTEMA FISCAL MULTI-PAÍS - README

## 📖 DESCRIPCIÓN

Sistema completo de cálculos fiscales para pagos a instructores de TODO EL MUNDO.

**Características principales:**
- ✅ Soporte para 5+ países (México, USA, España, Argentina, Internacional)
- ✅ Múltiples regímenes fiscales por país
- ✅ Conversión automática de divisas
- ✅ Cálculo de impuestos automático
- ✅ Validación de límites anuales (RESICO México)
- ✅ Sistema de alertas fiscales
- ✅ 7 métodos de pago soportados
- ✅ **Ventas con IVA incluido**

---

## 🚀 INSTALACIÓN

### Backend (Ya instalado)

Los siguientes archivos ya fueron creados:

```
api/
├── service/
│   └── fiscal.service.js          ✅ Servicio principal
├── models/
│   ├── InstructorEarnings.js      ✅ Actualizado con campos fiscales
│   ├── Sale.js                    ✅ Integrado con FiscalService
│   └── User.js                    ✅ Ya tiene campos fiscales
├── controllers/
│   └── FiscalController.js        ✅ Endpoints del sistema
├── router/
│   ├── Fiscal.js                  ✅ Rutas fiscales
│   └── index.js                   ✅ Actualizado
└── scripts/
    └── test-fiscal-calculations.js ✅ Script de pruebas
```

### Frontend (Por implementar)

Necesitas crear:

```
cursos/src/app/
├── core/
│   ├── models/
│   │   └── fiscal.interface.ts    ⏳ Interfaces TypeScript
│   └── services/
│       └── fiscal.service.ts      ⏳ Servicio Angular
└── pages/
    ├── fiscal-config/             ⏳ Configuración fiscal
    ├── instructor-earnings/        ⏳ Dashboard instructor
    └── admin-earnings/             ⏳ Dashboard admin
```

---

## 🧪 PROBAR EL SISTEMA

### 1. Ejecutar Script de Pruebas

```bash
cd /Users/codfull-stack/Desktop/plataforma/api
node scripts/test-fiscal-calculations.js
```

**Output esperado:**
```
🧪 INICIANDO PRUEBAS DEL SISTEMA FISCAL
═══════════════════════════════════════════════════════════════════

📍 ESCENARIO 1: Instructor Mexicano con RESICO
──────────────────────────────────────────────────────────────────

✅ Venta: $100 USD
   Tipo cambio: 1 USD = 17.5 MXN
   Venta en MXN: $1750.00 MXN
   (Ya incluye IVA del 16%)

💰 Comisión plataforma (10%): -$175.00 MXN

📊 IMPUESTOS:
   Subtotal sin IVA: $1357.76 MXN
   IVA (16%): +$217.24 MXN
   Retención IVA (2/3): -$144.83 MXN
   Retención ISR (1%): -$13.58 MXN
   Total impuestos: -$158.41 MXN

💳 Método de pago: Transferencia Bancaria
   Comisión: $0.00 MXN

──────────────────────────────────────────────────────────────────
💵 TOTAL A RECIBIR: $1416.59 MXN
   (≈ $80.95 USD)
──────────────────────────────────────────────────────────────────

[... más escenarios ...]

🎉 TODAS LAS PRUEBAS COMPLETADAS
```

### 2. Probar Endpoints con cURL

**Obtener configuración fiscal:**
```bash
curl -X GET http://localhost:3000/api/fiscal/my-config \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Obtener mis ganancias:**
```bash
curl -X GET http://localhost:3000/api/fiscal/my-earnings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Actualizar configuración:**
```bash
curl -X PUT http://localhost:3000/api/fiscal/update-config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "country": "MX",
    "paymentMethod": "bank_transfer",
    "regimenFiscal": "626",
    "rfc": "PEPJ850101XXX"
  }'
```

---

## 📊 ENDPOINTS DISPONIBLES

### Para Instructores

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/fiscal/my-config` | Obtener mi configuración fiscal |
| PUT | `/api/fiscal/update-config` | Actualizar mi configuración |
| GET | `/api/fiscal/my-earnings` | Obtener mis ganancias |
| GET | `/api/fiscal/countries` | Lista de países soportados |
| GET | `/api/fiscal/country-config/:code` | Config de un país |

### Para Admin

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/fiscal/all-earnings` | Ganancias de todos |
| PUT | `/api/fiscal/mark-as-paid` | Marcar como pagado |

---

## 🌍 PAÍSES SOPORTADOS

### 🇲🇽 México

**Regímenes fiscales:**
- **RESICO (626)**: Para ingresos hasta $3.5M MXN/año
  - IVA: 16% (se retiene 2/3)
  - ISR: Progresivo 1%-2.5%
  - Límite anual: $3,500,000 MXN
  
- **Honorarios**: Prestación de servicios
  - IVA: 16% (se retiene 2/3)
  - ISR: 10%
  
- **Actividad Empresarial (612)**: Negocios
  - Sin retenciones automáticas

**Métodos de pago:**
- Transferencia bancaria (0% comisión)
- PayPal (3.5% + $0.30 USD)
- OXXO (3%)

### 🇺🇸 USA

**Regímenes fiscales:**
- **Independent Contractor (1099)**
  - Sin retención de impuestos
  - El instructor reporta en su 1040

**Métodos de pago:**
- PayPal (3.5% + $0.30)
- Stripe (2.9% + $0.30)
- Transferencia bancaria
- Wise (1.5%)

### 🇪🇸 España

**Regímenes fiscales:**
- **Autónomo**
  - Retención IRPF: 15%
  - IVA: 21%

**Métodos de pago:**
- SEPA (0.5%)
- PayPal (3.5% + $0.30)
- Transferencia bancaria

### 🇦🇷 Argentina

**Regímenes fiscales:**
- **Monotributo**: Régimen simplificado
- **Responsable Inscripto**: Régimen general

**Métodos de pago:**
- Transferencia bancaria
- PayPal

### 🌎 Internacional

**Para cualquier otro país:**
- Sin retenciones fiscales
- Métodos: PayPal, Wise, Payoneer

---

## 💡 EJEMPLO DE USO

### Flujo Completo de una Venta

```javascript
// 1. Estudiante compra curso por $100 USD
const sale = await Sale.create({
  user: studentId,
  method_payment: 'stripe',
  currency_total: 'USD',
  status: 'Pendiente',
  total: 100,
  detail: [{
    product: courseId,
    product_type: 'course',
    price_unit: 100
  }]
});

// 2. Admin marca como pagado
sale.status = 'Pagado';
await sale.save(); // ✅ Aquí se dispara el hook

// 3. Hook pre-save:
//    - Crea inscripción (CourseStudent)
//    - Obtiene datos del instructor
//    - Llama a FiscalService.calculateInstructorPayout()
//    - Crea InstructorEarnings con todos los cálculos
//    - Actualiza ingresoAcumuladoAnual del instructor

// 4. Resultado en InstructorEarnings:
{
  instructor: instructorId,
  sale_price: 100,
  currency: 'USD',
  platform_commission_amount: 10,
  fiscal: {
    country: 'MX',
    tax_regime: '626',
    subtotal_sin_iva: 1357.76,
    iva_amount: 217.24,
    retencion_iva: 144.83,
    isr_amount: 13.58,
    total_taxes: 158.41
  },
  payment_method: 'bank_transfer',
  instructor_earning: 1416.59,
  instructor_earning_usd: 80.95,
  status: 'pending' // Cambiará a 'available' después de X días
}
```

---

## 🔧 CONFIGURACIÓN

### Tipos de Cambio

Por defecto usa valores hardcoded:

```javascript
// En fiscal.service.js
function getFallbackRates() {
  return {
    USD: 1,
    MXN: 17.50,
    EUR: 0.93,
    ARS: 350.00
  };
}
```

**Para usar API real:**

1. Obtener API key de exchangeratesapi.io o similar
2. Actualizar `getExchangeRates()` en fiscal.service.js:

```javascript
async function getExchangeRates() {
  const response = await fetch(
    `https://api.exchangeratesapi.io/latest?base=USD&access_key=${process.env.EXCHANGE_API_KEY}`
  );
  const data = await response.json();
  return {
    timestamp: new Date(),
    base: 'USD',
    rates: data.rates
  };
}
```

### Comisiones

Configurables en `PAYMENT_FEES`:

```javascript
const PAYMENT_FEES = {
  paypal: { rate: 3.5, fixed: 0.30 },
  stripe: { rate: 2.9, fixed: 0.30 },
  wise: { rate: 1.5, fixed: 0 },
  bank_transfer: { rate: 0, fixed: 0 }
};
```

---

## 🚨 VALIDACIONES IMPORTANTES

### 1. Límites RESICO (México)

```javascript
const validation = FiscalService.validateTaxLimits(instructor, newAmount);

if (!validation.canContinue) {
  // BLOQUEADO - No procesar pago
  console.error('❌ Límite excedido');
  return;
}

if (validation.alerts.length > 0) {
  // Enviar alertas al instructor
  for (const alert of validation.alerts) {
    await sendEmail(instructor, alert);
  }
}
```

### 2. Reseteo Anual

Ejecutar cada 1 de enero (cron job):

```javascript
import User from './models/User.js';
import FiscalService from './service/fiscal.service.js';

async function resetAllInstructors() {
  const instructors = await User.find({ rol: 'instructor' });
  
  for (const instructor of instructors) {
    await FiscalService.resetAnnualIncome(instructor);
  }
  
  console.log(`✅ ${instructors.length} instructores reseteados`);
}
```

---

## 📝 NOTAS IMPORTANTES

### ✅ Ventas con IVA Incluido

**MUY IMPORTANTE:** Las ventas YA incluyen el IVA. El cliente paga $100 USD que incluyen el 16% de IVA.

El sistema automáticamente:
1. Separa el IVA del subtotal
2. Calcula las retenciones sobre el IVA
3. Calcula el ISR sobre el subtotal sin IVA

**Ejemplo:**
```
Precio al cliente: $1,750 MXN (CON IVA INCLUIDO)
  ↓
Subtotal sin IVA: $1,750 / 1.16 = $1,507.76 MXN
IVA (16%): $1,750 - $1,507.76 = $242.24 MXN
```

### 🔄 Flujo de Estados

```
pending → available → paid
   ↓
blocked (si excede límite)
```

- **pending**: Recién creado, esperando días de seguridad
- **available**: Ya disponible para pago
- **paid**: Ya pagado al instructor
- **blocked**: Bloqueado por límite fiscal

---

## 🆘 TROUBLESHOOTING

### Error: "Cannot find module 'fiscal.service.js'"

Verifica que el archivo existe:
```bash
ls /Users/codfull-stack/Desktop/plataforma/api/service/fiscal.service.js
```

### Error: "Tipo de cambio no disponible"

El sistema usa valores fallback. Para producción, integra una API real de tipos de cambio.

### Error: "País no soportado"

Agrega el país en `COUNTRY_CONFIGS` en fiscal.service.js

### Las ganancias no se calculan

Verifica:
1. Sale.status está cambiando a 'Pagado'
2. Los hooks pre-save están habilitados
3. Revisa logs en consola del servidor

---

## 🎯 PRÓXIMOS PASOS

1. ✅ Backend completado
2. ⏳ Implementar frontend:
   - Crear FiscalService (Angular)
   - Crear interfaces TypeScript
   - Crear FiscalConfigComponent
   - Crear InstructorEarningsComponent
   - Crear AdminEarningsComponent
3. ⏳ Integrar API real de tipos de cambio
4. ⏳ Agregar más países (Colombia, Perú, etc.)
5. ⏳ Sistema de facturas automático

---

## 📞 SOPORTE

Para dudas sobre:
- **Fiscalidad mexicana**: Consultar con contador certificado
- **Implementación técnica**: Revisar este README y FISCAL-SYSTEM-GUIDE.md
- **Agregar países**: Ver `COUNTRY_CONFIGS` en fiscal.service.js

---

**Versión**: 1.0.0  
**Fecha**: 27 de Octubre, 2025  
**Estado**: ✅ Backend completo, Frontend pendiente

---

## 📚 DOCUMENTACIÓN ADICIONAL

- `FISCAL-SYSTEM-GUIDE.md` - Guía completa del sistema
- `test-fiscal-calculations.js` - Script de pruebas
- Ver artifact "Sistema Fiscal - Resumen Completo" para detalles de implementación frontend
