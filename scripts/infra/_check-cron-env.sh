#!/usr/bin/env bash
echo "=== schemas que tienen tabla 'empresas' ==="
docker exec -i supabase-db psql -U postgres -d postgres -At -c "SELECT table_schema FROM information_schema.tables WHERE table_name='empresas' ORDER BY 1;"
echo ""
echo "=== empresa_id distinct en neura.clientes ==="
docker exec -i supabase-db psql -U postgres -d postgres -At -c "SELECT DISTINCT empresa_id FROM neura.clientes;"
echo ""
echo "=== contenedores (filtro ku2kapt / neura) ==="
docker ps --format '{{.Names}}' | grep -iE "ku2kapt|neura" | head
echo ""
echo "=== CRON_SECRET en contenedor app ==="
APP=$(docker ps --format '{{.Names}}' | grep -iE "ku2kapt" | head -1)
echo "APP=$APP"
if [ -n "$APP" ]; then
  docker exec "$APP" sh -lc 'if [ -n "$CRON_SECRET" ]; then echo CRON_SECRET_SET len=${#CRON_SECRET}; else echo CRON_SECRET_MISSING; fi; echo APP_DB_SCHEMA=$APP_DB_SCHEMA'
fi
