# 🚀 GUÍA DE DEPLOYMENT A PRODUCCIÓN

Esta guía te llevará paso a paso para desplegar tu plataforma LMS a producción de forma segura.

---

## 📋 PRE-REQUISITOS

Antes de comenzar, asegúrate de tener:

- [ ] Cuenta de PayPal Business aprobada
- [ ] Dominio registrado (ej: `tudominio.com`)
- [ ] Certificado SSL/HTTPS configurado
- [ ] Servidor/Hosting contratado (Railway, Render, AWS, DigitalOcean, etc.)
- [ ] MongoDB Atlas con cluster de producción
- [ ] Backup reciente de tu base de datos

---

## ⚠️ PASO 0: VERIFICACIÓN PRE-PRODUCCIÓN

**EJECUTA PRIMERO ESTE COMANDO:**

```bash
cd api
npm run pre-production
```

Este script verificará:
- ✅ Archivo .env configurado correctamente
- ✅ JWT_SECRETO seguro (64+ caracteres)
- ✅ Variables críticas definidas
- ✅ .env no está versionado en Git
- ✅ Dependencias de seguridad instaladas

**SI HAY ERRORES, NO CONTINÚES HASTA RESOLVERLOS.**

---

## 🔧 PASO 1: CONFIGURAR BACKEND

### 1.1 Actualizar `.env` para Producción

```bash
# En api/.env

# 🔴 CAMBIAR ESTOS VALORES
NODE_ENV=production
PAYPAL_MODE=live

# URLs de producción
URL_BACKEND=https://api.tudominio.com
URL_FRONTEND=https://tudominio.com

# 🔴 CREDENCIALES DE PAYPAL LIVE (NO SANDBOX)
# Obtener desde: https://developer.paypal.com/dashboard/applications/live
PAYPAL_CLIENT_ID=tu_client_id_de_produccion_LIVE
PAYPAL_CLIENT_SECRET=tu_client_secret_de_produccion_LIVE

# Verificar que JWT_SECRETO sea seguro
JWT_SECRETO=tu_secret_de_64_caracteres_o_mas

# MongoDB Atlas (Cluster de producción)
MONGO_URI=mongodb+srv://usuario_prod:password_fuerte@cluster-prod.mongodb.net/lms_prod
```

### 1.2 Generar Nuevo JWT Secret (si aún no lo hiciste)

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copia el resultado y pégalo en `JWT_SECRETO=...`

---

## 🎨 PASO 2: CONFIGURAR FRONTEND

### 2.1 Actualizar `environment.prod.ts`

```typescript
// cursos/src/environments/environment.prod.ts

export const environment: Environment = {
  production: true,
  
  // 🔴 CAMBIAR A TU DOMINIO REAL
  url: 'https://api.tudominio.com/api/',
  
  images: {
    user: 'https://api.tudominio.com/api/users/imagen-usuario/',
    cat: 'https://api.tudominio.com/api/categories/imagen-categorie/',
    course: 'https://api.tudominio.com/api/courses/imagen-course/',
    project: 'https://api.tudominio.com/api/projects/imagen-project/',
  },
  
  paypal: {
    // 🔴 CLIENT ID DE PAYPAL LIVE (no sandbox)
    clientId: 'TU_CLIENT_ID_LIVE_DE_PAYPAL',
    redirectUrl: 'https://tudominio.com'
  }
};
```

### 2.2 Build de Producción

```bash
cd cursos
npm run build
```

Los archivos compilados estarán en `dist/cursos/browser/`

---

## 🌐 PASO 3: OBTENER CREDENCIALES DE PAYPAL LIVE

### 3.1 Activar Cuenta Business

1. Ve a https://developer.paypal.com/dashboard
2. Cambia de **Sandbox** a **Live** (switch arriba a la derecha)
3. Si no tienes una app Live, crea una:
   - Click en "Create App"
   - Nombre: "Dev-Sharks LMS Production"
   - Tipo: "Merchant"

### 3.2 Obtener Credenciales

1. En tu app Live, copia:
   - **Client ID** → Pegar en `environment.prod.ts` y `.env`
   - **Secret** → Pegar SOLO en `.env` (NUNCA en el frontend)

2. Configurar Return URL:
   - En la app de PayPal, ve a "App Settings"
   - Agrega tu Return URL: `https://tudominio.com`

⚠️ **IMPORTANTE:** Las credenciales de Sandbox NO funcionan en producción. Debes usar credenciales LIVE.

---

## 🚢 PASO 4: DEPLOYMENT

### Opción A: Railway (Recomendado para empezar)

#### Backend:
```bash
cd api
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Inicializar proyecto
railway init

# Configurar variables de entorno
railway variables set NODE_ENV=production
railway variables set MONGO_URI="tu_mongo_uri_produccion"
railway variables set JWT_SECRETO="tu_jwt_secreto_64chars"
railway variables set PAYPAL_MODE=live
railway variables set PAYPAL_CLIENT_ID="tu_paypal_live_client_id"
railway variables set PAYPAL_CLIENT_SECRET="tu_paypal_live_secret"

# Deploy
railway up
```

Railway te dará una URL: `https://tu-app.railway.app`

#### Frontend:
```bash
cd cursos

# Actualizar environment.prod.ts con la URL de Railway
# url: 'https://tu-app.railway.app/api/'

# Build
npm run build

# Opción 1: Vercel
npx vercel --prod

# Opción 2: Netlify
npx netlify deploy --prod --dir=dist/cursos/browser
```

### Opción B: Manual (VPS / DigitalOcean)

#### Backend:
```bash
# En tu servidor
git clone tu-repositorio
cd api
npm install --production
pm2 start index.js --name "lms-api" -i max
pm2 save
pm2 startup
```

#### Frontend:
```bash
# Configurar Nginx
sudo nano /etc/nginx/sites-available/tudominio.com

# Agregar:
server {
    listen 80;
    server_name tudominio.com;
    root /var/www/lms/cursos/dist/cursos/browser;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Habilitar sitio
sudo ln -s /etc/nginx/sites-available/tudominio.com /etc/nginx/sites-enabled/
sudo systemctl reload nginx

# Configurar SSL con Let's Encrypt
sudo certbot --nginx -d tudominio.com -d www.tudominio.com
```

---

## ✅ PASO 5: VERIFICACIÓN POST-DEPLOYMENT

### 5.1 Health Checks

```bash
# Verificar que el backend responde
curl https://api.tudominio.com/api/health

# Debería retornar:
# {
#   "uptime": 123,
#   "message": "OK",
#   "checks": {
#     "database": "connected and responding"
#   }
# }
```

### 5.2 Probar Funcionalidad Crítica

- [ ] Registro de usuario
- [ ] Login
- [ ] Ver catálogo de cursos
- [ ] Agregar curso al carrito
- [ ] Proceso de checkout con PayPal (MODO LIVE)
- [ ] Confirmación de compra
- [ ] Acceso al curso comprado
- [ ] Billetera digital funciona

### 5.3 Monitoreo

Configurar monitoreo con UptimeRobot:
1. Ve a https://uptimerobot.com
2. Crea nuevo monitor HTTP(S)
3. URL: `https://api.tudominio.com/api/health`
4. Intervalo: Cada 5 minutos
5. Configura alertas por email/SMS

---

## 🐛 TROUBLESHOOTING

### Error: "CORS blocked"
**Causa:** Frontend no está en la lista de orígenes permitidos

**Solución:**
```javascript
// api/index.js - Verificar allowedOrigins
const allowedOrigins = [
    'https://tudominio.com',
    'https://www.tudominio.com',
    // NO incluir localhost en producción
];
```

### Error: "PayPal payment failed"
**Causa:** Usando credenciales de Sandbox en producción o viceversa

**Solución:**
1. Verificar `.env` tiene `PAYPAL_MODE=live`
2. Verificar credenciales son de modo LIVE
3. Verificar Return URL configurada en PayPal dashboard

### Error: "Database connection failed"
**Causa:** IP de tu servidor no está en whitelist de MongoDB Atlas

**Solución:**
1. Ve a MongoDB Atlas > Network Access
2. Agrega la IP de tu servidor
3. O habilita "Allow access from anywhere" (0.0.0.0/0) temporalmente

### Frontend muestra localhost en imágenes
**Causa:** No se está usando `environment.prod.ts`

**Solución:**
```bash
# Verificar que el build use production
ng build --configuration production

# O
npm run build
```

---

## 📊 MONITOREO Y MANTENIMIENTO

### Logs

```bash
# Ver logs del backend (si usas PM2)
pm2 logs lms-api

# Ver logs en tiempo real
pm2 logs lms-api --lines 100
```

### Backup Automático de MongoDB

```bash
# Crear script de backup
nano ~/backup-mongo.sh

#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --uri="$MONGO_URI" --out="/backups/mongodb/backup_$DATE"

# Mantener solo últimos 7 días
find /backups/mongodb -type d -mtime +7 -exec rm -rf {} \;

# Hacer ejecutable
chmod +x ~/backup-mongo.sh

# Agregar a crontab (cada día a las 3 AM)
crontab -e
0 3 * * * /home/usuario/backup-mongo.sh
```

### Actualizar en Producción

```bash
# 1. Hacer backup de BD
mongodump --uri="$MONGO_URI" --out="backup_antes_update_$(date +%Y%m%d)"

# 2. Pull cambios
git pull origin main

# 3. Backend
cd api
npm install --production
pm2 restart lms-api

# 4. Frontend
cd ../cursos
npm run build
# Deploy el contenido de dist/ a tu hosting
```

---

## 🔐 SEGURIDAD POST-DEPLOYMENT

- [ ] Cambiar todos los passwords por defecto
- [ ] Habilitar 2FA en MongoDB Atlas
- [ ] Habilitar 2FA en PayPal
- [ ] Configurar Cloudflare para DDoS protection
- [ ] Revisar logs diariamente las primeras 2 semanas
- [ ] Configurar alertas de errores (Sentry, LogRocket)
- [ ] Hacer backup manual antes de cualquier cambio mayor

---

## 📞 SOPORTE

Si encuentras problemas:

1. Revisa los logs: `pm2 logs lms-api`
2. Verifica health check: `/api/health`
3. Revisa variables de entorno
4. Consulta la documentación de PayPal
5. Revisa los issues del repositorio

---

## 🎉 ¡LISTO!

Tu plataforma ya está en producción. Monitorea de cerca las primeras 48 horas y resuelve cualquier issue que aparezca rápidamente.

**Próximos pasos recomendados:**
- Implementar CDN para assets (Cloudflare)
- Configurar email transaccional (SendGrid)
- Agregar analytics (Google Analytics)
- Implementar tests automáticos
- Configurar CI/CD con GitHub Actions

¡Mucha suerte con tu lanzamiento! 🚀
