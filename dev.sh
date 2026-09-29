#!/bin/sh
# Sitio + panel en local: http://localhost:8000 y http://localhost:8000/admin/
cd "$(dirname "$0")"

npx --yes decap-server &
CMS=$!
python3 -m http.server 8000 &
WEB=$!
apagar() { kill $CMS $WEB 2>/dev/null; pkill -P $CMS 2>/dev/null; exit 0; }
trap apagar INT TERM HUP

sleep 2
echo ""
echo "  Sitio:  http://localhost:8000"
echo "  Panel:  http://localhost:8000/admin/"
echo "  Excel:  http://localhost:8000/admin/excel/"
echo "  (Ctrl+C para apagar)"
wait
