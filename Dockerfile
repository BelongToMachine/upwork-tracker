FROM node:22-bookworm-slim AS frontend-build

WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_APP_BASE=/upwork/
ARG VITE_API_BASE=/upwork/api
ENV VITE_APP_BASE=${VITE_APP_BASE}
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

FROM python:3.14-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /uvx /usr/local/bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UPWORK_DB_PATH=/app/backend/data/upwork.db

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY backend/ ./backend/
COPY --from=frontend-build /src/frontend/dist ./frontend/dist/
RUN mkdir -p /app/backend/data

EXPOSE 8000
CMD ["/app/.venv/bin/uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
