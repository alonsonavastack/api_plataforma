#!/bin/bash

# Script para encontrar todos los console.log en UserController.js

echo "Buscando console.log, console.error y console.warn en UserController.js:"
echo "========================================================================"

grep -n "console\.\(log\|error\|warn\)" /Users/codfull-stack/Desktop/plataforma/api/controllers/UserController.js

echo ""
echo "========================================================================"
echo "Búsqueda completada"
