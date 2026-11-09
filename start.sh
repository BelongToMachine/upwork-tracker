#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -d frontend/node_modules ]]; then
  npm ci --prefix frontend
fi

uv sync
npm --prefix frontend run build
exec uv run uvicorn backend.main:app --host 127.0.0.1 --port 8765
