# notify-guard (backend)

Backend service for HA Notify Guard.

## Stack

- Bun
- Hono
- TypeORM + SQLite

## Installation

```bash
bun install
```

## Run

From the repository root:

```bash
bun run notify-guard/src/index.ts
```

## Formatting and lint

```bash
bun run format
bun run lint
```

## Architecture

- `src/index.ts` — entrypoint.
- `src/app.ts` — creates the Hono app.
- `src/db/` — entities + datasource.
- `src/routes/` — HTTP API.
- `src/services/` — business logic.
- `src/workers/` — background jobs.
- `src/lib/` — shared utilities (logging, etc.).

## See also

For full product and API documentation, see the root README: `../README.md`.
