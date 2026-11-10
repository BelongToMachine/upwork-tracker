# Upwork Desk Frontend

React, TypeScript, and Vite application for tracking personal Upwork opportunities.

## Commands

```sh
npm ci
npm run dev
npm run build
```

The development server runs on port 5173 and proxies `/api` to the local FastAPI backend. Production builds use `/upwork/` as the application base path and `/upwork/api` for API requests when built with the project Dockerfile.
