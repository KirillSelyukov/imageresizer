# Image Resizer

A full-stack web app for batch resizing JPEG and PNG images. Upload up to 10 images, choose a scale percentage, and download the results individually or as a single ZIP.

## Architecture

```
image-resizer/
├── backend/          # Express API, SQLite, worker thread pool
└── frontend/         # React + Vite SPA
```

**Backend** — Node.js/Express receives uploads, persists jobs in SQLite, and processes images in a worker thread pool (sharp). Jobs are queued in memory and processed concurrently up to `cpus - 1` workers.

**Frontend** — React SPA that polls job status and downloads results. Files are fetched as blobs so cancelling the browser save dialog doesn't lose the item; cached blobs allow re-triggering the dialog without a second server request.

## Getting started

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
npm run install:all
```

### Run (development)

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

The Vite dev server proxies `/api/*` to the backend, so the frontend only needs one origin in development.

### Run (production preview)

```bash
npm run build --prefix frontend
npm start
```

## Scripts

| Command | Description |
|---|---|
| `npm run install:all` | Install dependencies for root, backend, and frontend |
| `npm run dev` | Start backend and frontend in development mode |
| `npm start` | Start backend and frontend in production/preview mode |
| `npm test` | Run backend and frontend test suites sequentially |
| `npm run test:backend` | Jest — backend API and validation tests |
| `npm run test:frontend` | Vitest — React component and accessibility tests |

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/jobs` | Upload images and queue resize jobs |
| `GET` | `/jobs/:id` | Poll job status |
| `GET` | `/jobs/:id/download` | Download a single resized image |
| `POST` | `/jobs/download-all` | Download all done jobs as a ZIP |

### POST /jobs

`multipart/form-data` with fields:

| Field | Type | Constraint |
|---|---|---|
| `images` | file(s) | JPEG or PNG, max 50 MB each, up to 10 per session |
| `sessionId` | string | Required; persisted in browser `localStorage` |
| `scale` | integer | 1–100 (percent of original dimensions) |

### POST /jobs/download-all

```json
{ "jobIds": ["uuid-1", "uuid-2"] }
```

Returns `application/zip`. Only includes jobs with status `done`; pending/failed jobs in the array are silently skipped.

## Tech stack

| Layer | Technology |
|---|---|
| HTTP server | Express 4 |
| Image processing | sharp (libvips) |
| Job queue | Node.js worker threads |
| Database | SQLite via better-sqlite3 |
| ZIP creation | archiver |
| Frontend framework | React 18 |
| Build tool | Vite 5 |
| Icons | lucide-react |
| Backend tests | Jest + supertest |
| Frontend tests | Vitest + React Testing Library |

## Development tools

### Inspecting the database

The job queue is persisted in `backend/jobs.db` (SQLite).

**Option A — VS Code extension**
Install [SQLite Viewer](https://marketplace.visualstudio.com/items?itemName=qwtel.sqlite-viewer) by Florian Klampfer. Open `backend/jobs.db` directly in the editor. Read-only but instant — no separate app needed.

**Option B — DB Browser for SQLite**
Full GUI with read/write support and SQL query editor.
```bash
brew install --cask db-browser-for-sqlite
```
Then open `backend/jobs.db`.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Backend HTTP port |
| `DB_PATH` | `backend/jobs.db` | SQLite database file path (set to `:memory:` in tests) |
