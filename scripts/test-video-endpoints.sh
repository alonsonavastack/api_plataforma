#!/bin/bash

# Script de prueba para endpoints de video
# Uso: ./test-video-endpoints.sh

echo "🧪 Probando endpoints de video..."
echo ""

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# URL base del API
BASE_URL="http://localhost:3000/api/course-clases"

# Token de autenticación (debes reemplazar esto con un token válido)
TOKEN="YOUR_AUTH_TOKEN_HERE"

echo "📌 Nota: Asegúrate de tener un token válido en la variable TOKEN"
echo ""

# Función para hacer peticiones
test_endpoint() {
    local endpoint=$1
    local url=$2
    local description=$3
    
    echo "${YELLOW}Probando: ${description}${NC}"
    echo "Endpoint: ${endpoint}"
    echo "URL: ${url}"
    echo ""
    
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
        "${BASE_URL}${endpoint}?url=${url}" \
        -H "Authorization: Bearer ${TOKEN}")
    
    http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE/d')
    
    if [ "$http_code" -eq 200 ]; then
        echo "${GREEN}✅ Éxito (HTTP $http_code)${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo "${RED}❌ Error (HTTP $http_code)${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# Probar Vimeo
echo "🎬 Probando Vimeo..."
test_endpoint "/vimeo-data" "https://vimeo.com/123456789" "Video de Vimeo de prueba"

# Probar YouTube - Formatos diferentes
echo "📺 Probando YouTube..."
test_endpoint "/youtube-data" "https://www.youtube.com/watch?v=dQw4w9WgXcQ" "YouTube formato watch"
test_endpoint "/youtube-data" "https://youtu.be/dQw4w9WgXcQ" "YouTube formato corto"
test_endpoint "/youtube-data" "https://www.youtube.com/embed/dQw4w9WgXcQ" "YouTube formato embed"

echo "${GREEN}✅ Pruebas completadas${NC}"
