# Upwork Desk

A private, table-first tracker for Upwork opportunities. Keep job details, budgets, proposal counts, employer interviews, your interest rating, and application status in one place. Records are stored in SQLite.

## Run locally

Requirements: Node.js, Python, and [uv](https://docs.astral.sh/uv/).

```sh
./start.sh
```

The script installs dependencies, builds the frontend, and starts the local service. Open <http://127.0.0.1:8765>. The database is stored at `backend/data/upwork.db`, which is ignored by Git.

## Development

Start the API in one terminal:

```sh
uv sync
uv run uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload
```

Start the frontend in another terminal:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Open <http://127.0.0.1:5173>. Vite forwards `/api` requests to the local API.

## Container deployment

The multi-stage Dockerfile builds the React app with Node 22 and runs FastAPI on Python 3.14. Compose publishes the app on `127.0.0.1:8767` and mounts `backend/data` for persistent SQLite storage. The production frontend is built for `/upwork/`; the F1 Control Panel provides that same-origin route.

On the F1 NAS, the `deck` account uses rootless Podman with the standard Compose file:

```sh
podman compose up -d --build
```

Keep port 8767 bound to loopback and access the app through the F1 Control Panel. The database directory is never included in the image.

## Import, export, and backups

Add jobs manually, import JSON or CSV from the Data menu, and export either format as a backup. The record schema is documented in [`schema/job-record.schema.json`](schema/job-record.schema.json). Employer interview counts and your application status are stored separately.

Sample jobs are optional and are only added when you choose **Load samples**. For a filesystem-level backup, stop the service first or use SQLite's backup API; do not copy a live database file directly.
