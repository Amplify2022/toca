#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "TOCÁ demo: http://localhost:5173/#/"
echo "App: http://localhost:5173/#/explore"
echo "Admin: http://localhost:5173/#/admin"
python3 -m http.server 5173 --directory web
