# 📊 DOCUMENTACIÓN DE REPORTES API

## Información General

Todos los endpoints de reportes requieren autenticación mediante token JWT.
El token debe enviarse en el header: `Authorization: Bearer {token}`

Los endpoints respetan los roles de usuario:
- **Admin**: Acceso completo a todos los reportes
- **Instructor**: Solo puede ver reportes de sus propios productos y estudiantes
- **Cliente**: Sin acceso a reportes

---

## 📈 REPORTES DE VENTAS

### 1. Ingresos por Período
**Endpoint:** `GET /api/reports/sales/income-by-period`

**Parámetros de consulta:**
- `period` (opcional): 'day', 'week', 'month' (default), 'year'

**Ejemplo de solicitud:**
```
GET /api/reports/sales/income-by-period?period=month
```

**Respuesta exitosa:**
```json
{
  "incomeData": [
    {
      "_id": "2024-01",
      "total": 15000.50,
      "count": 45
    },
    {
      "_id": "2024-02",
      "total": 18500.75,
      "count": 52
    }
  ]
}
```

---

### 2. Top Productos Más Vendidos
**Endpoint:** `GET /api/reports/sales/top-products`

**Parámetros de consulta:**
- `limit` (opcional): Número de productos a retornar (default: 10)

**Ejemplo de solicitud:**
```
GET /api/reports/sales/top-products?limit=5
```

**Respuesta exitosa:**
```json
{
  "topProducts": [
    {
      "product_id": "60d5ec49f1b2c72b8c8e4f1a",
      "product_type": "course",
      "title": "Curso de React Avanzado",
      "total_sales": 150,
      "total_revenue": 22500.00
    }
  ]
}
```

---

### 3. Ventas por Categoría
**Endpoint:** `GET /api/reports/sales/by-category`

**Respuesta exitosa:**
```json
{
  "salesByCategory": [
    {
      "category_id": "60d5ec49f1b2c72b8c8e4f1b",
      "category_title": "Desarrollo Web",
      "total_sales": 250,
      "total_revenue": 37500.00
    }
  ]
}
```

---

### 4. Métodos de Pago (Solo Admin)
**Endpoint:** `GET /api/reports/sales/payment-methods`

**Respuesta exitosa:**
```json
{
  "paymentMethods": [
    {
      "method": "PayPal",
      "total_transactions": 450,
      "total_revenue": 67500.00
    },
    {
      "method": "Stripe",
      "total_transactions": 380,
      "total_revenue": 57000.00
    }
  ]
}
```

---

### 5. Comparativa de Períodos
**Endpoint:** `GET /api/reports/sales/period-comparison`

**Parámetros de consulta:**
- `period` (opcional): 'week', 'month' (default), 'quarter', 'year'

**Ejemplo de solicitud:**
```
GET /api/reports/sales/period-comparison?period=month
```

**Respuesta exitosa:**
```json
{
  "period": "month",
  "current": {
    "total_sales": 52,
    "total_revenue": 18500.75
  },
  "previous": {
    "total_sales": 45,
    "total_revenue": 15000.50
  },
  "growth": {
    "sales": 15.56,
    "revenue": 23.34
  }
}
```

---

## 👥 REPORTES DE ESTUDIANTES

### 6. Crecimiento de Estudiantes
**Endpoint:** `GET /api/reports/students/growth`

**Parámetros de consulta:**
- `period` (opcional): 'day', 'week', 'month' (default)

**Ejemplo de solicitud:**
```
GET /api/reports/students/growth?period=month
```

**Respuesta exitosa:**
```json
{
  "growth": [
    {
      "_id": "2024-01",
      "new_students": 120
    },
    {
      "_id": "2024-02",
      "new_students": 145
    }
  ],
  "totalStudents": 1250
}
```

---

### 7. Estudiantes Activos vs Inactivos
**Endpoint:** `GET /api/reports/students/active`

**Respuesta exitosa:**
```json
{
  "active": 850,
  "inactive": 400,
  "total": 1250,
  "active_percentage": "68.00"
}
```

---

### 8. Estudiantes por Curso
**Endpoint:** `GET /api/reports/students/by-course`

**Respuesta exitosa:**
```json
{
  "courseStats": [
    {
      "course_id": "60d5ec49f1b2c72b8c8e4f1a",
      "course_title": "React Avanzado",
      "student_count": 150
    }
  ]
}
```

---

### 9. Top Estudiantes
**Endpoint:** `GET /api/reports/students/top`

**Parámetros de consulta:**
- `limit` (opcional): Número de estudiantes (default: 10)

**Respuesta exitosa:**
```json
{
  "topStudents": [
    {
      "user_id": "60d5ec49f1b2c72b8c8e4f1c",
      "name": "Juan",
      "surname": "Pérez",
      "email": "juan@example.com",
      "total_purchases": 8,
      "total_spent": 1200.00
    }
  ]
}
```

---

## 📚 REPORTES DE PRODUCTOS

### 10. Análisis de Productos
**Endpoint:** `GET /api/reports/products/analysis`

**Parámetros de consulta:**
- `product_type` (opcional): 'course', 'project', o omitir para ambos

**Ejemplo de solicitud:**
```
GET /api/reports/products/analysis?product_type=course
```

**Respuesta exitosa:**
```json
{
  "products": [
    {
      "product_id": "60d5ec49f1b2c72b8c8e4f1a",
      "product_type": "course",
      "title": "React Avanzado",
      "slug": "react-avanzado",
      "category": "Desarrollo Web",
      "instructor": "Carlos Gómez",
      "price_usd": 150.00,
      "price_mxn": 2550.00,
      "total_sales": 150,
      "total_revenue": 22500.00,
      "avg_rating": 4.8,
      "total_reviews": 85,
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### 11. Productos con Bajo Rendimiento
**Endpoint:** `GET /api/reports/products/low-performing`

**Parámetros de consulta:**
- `min_sales` (opcional): Mínimo de ventas (default: 5)
- `min_rating` (opcional): Rating mínimo (default: 3)

**Ejemplo de solicitud:**
```
GET /api/reports/products/low-performing?min_sales=10&min_rating=3.5
```

**Respuesta exitosa:**
```json
{
  "lowPerformingProducts": [
    {
      "product_id": "60d5ec49f1b2c72b8c8e4f1d",
      "product_type": "course",
      "title": "Curso de Python Básico",
      "category": "Programación",
      "instructor": "María López",
      "total_sales": 3,
      "avg_rating": 3.2,
      "total_reviews": 5,
      "reason": "Pocas ventas"
    }
  ]
}
```

---

### 12. Análisis de Reviews
**Endpoint:** `GET /api/reports/products/reviews`

**Parámetros de consulta:**
- `product_id` (opcional): ID del producto específico

**Ejemplo de solicitud:**
```
GET /api/reports/products/reviews?product_id=60d5ec49f1b2c72b8c8e4f1a
```

**Respuesta exitosa:**
```json
{
  "reviews": [
    {
      "review_id": "60d5ec49f1b2c72b8c8e4f1e",
      "product_title": "React Avanzado",
      "product_type": "course",
      "user_name": "Juan Pérez",
      "rating": 5,
      "description": "Excelente curso, muy completo",
      "created_at": "2024-03-10T14:20:00.000Z"
    }
  ],
  "statistics": {
    "total_reviews": 85,
    "avg_rating": 4.8,
    "rating_distribution": {
      "1": 2,
      "2": 3,
      "3": 8,
      "4": 25,
      "5": 47
    }
  }
}
```

---

## 💰 REPORTES DE DESCUENTOS

### 13. Efectividad de Cupones (Solo Admin)
**Endpoint:** `GET /api/reports/discounts/coupon-effectiveness`

**Respuesta exitosa:**
```json
{
  "couponReport": [
    {
      "coupon_id": "60d5ec49f1b2c72b8c8e4f1f",
      "code": "VERANO2024",
      "type_discount": 1,
      "discount": 20,
      "num_use": 50,
      "num_use_total": 100,
      "total_uses": 45,
      "total_revenue": 6750.00,
      "total_discount_given": 1687.50,
      "roi": "400.00",
      "usage_rate": "45.00"
    }
  ]
}
```

---

### 14. Impacto de Descuentos (Solo Admin)
**Endpoint:** `GET /api/reports/discounts/impact`

**Parámetros de consulta:**
- `start_date` (opcional): Fecha inicio (YYYY-MM-DD)
- `end_date` (opcional): Fecha fin (YYYY-MM-DD)

**Ejemplo de solicitud:**
```
GET /api/reports/discounts/impact?start_date=2024-01-01&end_date=2024-12-31
```

**Respuesta exitosa:**
```json
{
  "total_revenue": 125000.00,
  "total_discount_given": 18750.00,
  "estimated_full_price": 143750.00,
  "discount_percentage": "13.04",
  "sales_with_discount": 450,
  "sales_without_discount": 1250
}
```

---

### 15. Rendimiento de Campañas (Solo Admin)
**Endpoint:** `GET /api/reports/discounts/campaign-performance`

**Respuesta exitosa:**
```json
{
  "campaignReport": [
    {
      "campaign_type": 2,
      "campaign_name": "Flash",
      "total_sales": 350,
      "total_revenue": 52500.00,
      "total_discount_given": 7875.00,
      "roi": "666.67"
    },
    {
      "campaign_type": 1,
      "campaign_name": "Normal",
      "total_sales": 280,
      "total_revenue": 42000.00,
      "total_discount_given": 6300.00,
      "roi": "666.67"
    },
    {
      "campaign_type": null,
      "campaign_name": "Sin campaña",
      "total_sales": 1250,
      "total_revenue": 187500.00,
      "total_discount_given": 0,
      "roi": "0"
    }
  ]
}
```

---

## 👨‍🏫 REPORTES DE INSTRUCTORES

### 16. Ranking de Instructores (Solo Admin)
**Endpoint:** `GET /api/reports/instructors/ranking`

**Respuesta exitosa:**
```json
{
  "instructorRanking": [
    {
      "instructor_id": "60d5ec49f1b2c72b8c8e4f20",
      "name": "Carlos",
      "surname": "Gómez",
      "email": "carlos@example.com",
      "total_courses": 12,
      "total_projects": 5,
      "total_students": 850,
      "total_revenue": 127500.00,
      "total_reviews": 425,
      "avg_rating": 4.7
    }
  ]
}
```

---

### 17. Detalle de Instructor
**Endpoint:** `GET /api/reports/instructors/detail`

**Parámetros de consulta:**
- `instructor_id` (opcional): ID del instructor (Solo Admin. Si es instructor, ve su propia info)

**Ejemplo de solicitud:**
```
GET /api/reports/instructors/detail?instructor_id=60d5ec49f1b2c72b8c8e4f20
```

**Respuesta exitosa:**
```json
{
  "instructor": {
    "id": "60d5ec49f1b2c72b8c8e4f20",
    "name": "Carlos",
    "surname": "Gómez",
    "email": "carlos@example.com"
  },
  "statistics": {
    "total_courses": 12,
    "total_projects": 5,
    "total_students": 850,
    "total_revenue": 127500.00,
    "total_sales": 1200,
    "avg_rating": 4.7,
    "total_reviews": 425
  },
  "revenue_by_month": [
    {
      "month": "2024-01",
      "revenue": 10500.00
    },
    {
      "month": "2024-02",
      "revenue": 12300.00
    }
  ],
  "top_products": [
    {
      "product_id": "60d5ec49f1b2c72b8c8e4f1a",
      "product_type": "course",
      "title": "React Avanzado",
      "sales": 150,
      "revenue": 22500.00
    }
  ],
  "recent_reviews": [
    {
      "review_id": "60d5ec49f1b2c72b8c8e4f1e",
      "product_title": "React Avanzado",
      "student_name": "Juan Pérez",
      "rating": 5,
      "description": "Excelente curso",
      "created_at": "2024-03-10T14:20:00.000Z"
    }
  ]
}
```

---

### 18. Distribución de Ingresos entre Instructores (Solo Admin)
**Endpoint:** `GET /api/reports/instructors/revenue-distribution`

**Respuesta exitosa:**
```json
{
  "total_revenue": 500000.00,
  "distribution": [
    {
      "instructor_id": "60d5ec49f1b2c72b8c8e4f20",
      "name": "Carlos Gómez",
      "revenue": 127500.00,
      "percentage": 25.50
    },
    {
      "instructor_id": "60d5ec49f1b2c72b8c8e4f21",
      "name": "María López",
      "revenue": 95000.00,
      "percentage": 19.00
    }
  ]
}
```

---

## 🔐 Autenticación

Todos los endpoints requieren el header de autenticación:

```javascript
headers: {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  'Content-Type': 'application/json'
}
```

---

## 📝 Códigos de Estado HTTP

- **200**: Éxito
- **401**: No autenticado (token inválido o expirado)
- **403**: Acceso denegado (sin permisos suficientes)
- **404**: Recurso no encontrado
- **500**: Error del servidor

---

## 💡 Ejemplos de Uso con JavaScript/Fetch

### Ejemplo 1: Obtener ingresos por mes (Admin)
```javascript
const getIncomeByMonth = async () => {
  const token = localStorage.getItem('token');
  
  const response = await fetch('http://localhost:3000/api/reports/sales/income-by-period?period=month', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  console.log(data);
};
```

### Ejemplo 2: Top productos del instructor
```javascript
const getMyTopProducts = async () => {
  const token = localStorage.getItem('token');
  
  const response = await fetch('http://localhost:3000/api/reports/sales/top-products?limit=5', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  console.log(data);
};
```

### Ejemplo 3: Detalle de instructor (propio)
```javascript
const getMyInstructorDetails = async () => {
  const token = localStorage.getItem('token');
  
  const response = await fetch('http://localhost:3000/api/reports/instructors/detail', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  console.log(data);
};
```

---

## 🎯 Casos de Uso Recomendados

### Para Dashboard de Admin:
1. `sales/income-by-period` - Mostrar gráfico de ingresos
2. `sales/top-products` - Productos estrella
3. `students/growth` - Crecimiento de usuarios
4. `instructors/ranking` - Mejores instructores
5. `discounts/coupon-effectiveness` - Efectividad de marketing

### Para Dashboard de Instructor:
1. `sales/income-by-period` - Mis ingresos mensuales
2. `sales/top-products` - Mis productos más vendidos
3. `students/by-course` - Estudiantes por curso
4. `instructors/detail` - Mi rendimiento detallado
5. `products/reviews` - Reviews de mis productos

---

## 📊 Recomendaciones de Visualización

### Gráficos sugeridos:
- **Ingresos por período**: Gráfico de líneas
- **Ventas por categoría**: Gráfico de dona/pie
- **Top productos**: Tabla o gráfico de barras horizontal
- **Crecimiento de estudiantes**: Gráfico de área
- **Distribución de ratings**: Gráfico de barras
- **Comparativa de períodos**: Cards con indicadores y flechas
- **Distribución de ingresos**: Gráfico de barras apiladas

---

## 🚀 Próximas Mejoras

Posibles endpoints adicionales:
- Proyección de ingresos futuros
- Análisis de cohort de estudiantes
- Tasas de conversión del embudo de ventas
- Análisis de abandono de carritos
- Reportes programados por email
- Exportación a PDF/Excel

---

**Versión:** 1.0  
**Última actualización:** Octubre 2025
