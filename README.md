# HA Notify Guard

HA Notify Guard is a device monitoring service for Home Assistant:

- pulls IP addresses from NetBox,
- checks availability via Ping and Modbus TCP (502),
- sends Telegram notifications (multiple bots and chats),
- stores queue data and history in SQLite,
- retries delivery with backoff when internet connectivity is unstable.

## Features

- NetBox device sync from `ipam/ip-addresses` with pagination.
- Enable/disable Ping and Modbus monitoring per device.
- Assign devices to bots, with support for multiple chats per bot.
- Anti-spam alert logic: one outage notification per outage episode.
- Guaranteed delivery: Telegram queue with automatic retries.
- Device availability history (online/offline slices by period).
- Svelte web UI with EN/UA localization.

## Project Structure

- `notify-guard/` — backend (Bun + Hono + TypeORM + SQLite).
- `notify-guard/frontend/` — frontend (Svelte + Vite + shadcn-svelte).

## Local Run

### 1) Backend

```bash
cd notify-guard
bun install
```

Run (from repository root):

```bash
bun run notify-guard/src/index.ts
```

Server starts at `http://localhost:8000`.

### 2) Frontend (dev)

```bash
cd notify-guard/frontend
bun install
bun run dev
```

Type check frontend:

```bash
bun run check
```

## Main API

- `GET /api/health` — health check.
- `GET|PUT /api/settings/netbox` — NetBox settings.
- `POST /api/netbox/sync` — device sync.
- `GET /api/devices` — device list.
- `PATCH /api/devices/:id` — update monitoring and bot assignments.
- `GET /api/devices/:id/history?period=24h|7d|30d|all` — availability history.
- `GET /api/bots` and CRUD for bots/chats.
- `POST /api/inbound/messages` — queue external Telegram message by `bot_name`.
- `GET /api/logs?limit=...&app_limit=...` — notification queue + app logs.

## External Message Inbound API (Node-RED / Home Assistant)

Use this endpoint to send custom notifications through Notify Guard queue (with retries, backoff, and DB history):

```http
POST /api/inbound/messages
Content-Type: application/json
```

Request body:

```json
{
	"bot_name": "MainBot",
	"chat_id": "-1001234567890",
	"text": "Boiler room: pressure too high",
	"source": "nodered",
	"idempotency_key": "nodered-boiler-pressure-2026-02-24T09:01"
}
```

Fields:

- `bot_name` (required) — bot name from Notify Guard UI.
- `text` (required) — message text.
- `chat_id` (optional) — target a specific active chat of that bot.
- `source` (optional) — prefix added to the message, e.g. `[nodered]`.
- `idempotency_key` (required) — prevents duplicate queue records on repeated calls.

Notes:

- If `chat_id` is omitted, the message is queued for all active chats of that bot.
- If `idempotency_key` is repeated for the same bot/chat, existing notification IDs are returned and new rows are not created.
- Endpoint is open (no auth) by design for easy local integration/testing.

## Logs and Diagnostics

`/api/logs` returns two blocks:

- `logs` — Telegram queue (`status`, `attempts`, `last_error`, `next_attempt_at`).
- `app_logs` — backend system errors (`scope`, `path`, `status`, `details`).

This helps diagnose `HTTP 500` and delivery issues after the fact.

## Roadmap

### MVP (already implemented)

- Device sync from NetBox.
- Per-device Ping/Modbus monitoring.
- Telegram notifications with queue, retries, and backoff.
- Availability history and basic period analytics.
- EN/UA UI localization.

### Next

- Dedicated app logs screen in frontend (without manual API calls).
- Improved health endpoint (DB status, worker status, queue length).
- Configurable retry policy thresholds/parameters in UI.
- Basic e2e/integration tests for critical APIs.

## Troubleshooting

### `EADDRINUSE` (port 8000 is already in use)

Cause: another backend process is already running.

Solution (PowerShell):

```powershell
$connection = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($connection) {
	$connection | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
		Stop-Process -Id $_ -Force
	}
}
```

Then start backend again:

```bash
bun run notify-guard/src/index.ts
```

### `HTTP 500` in frontend

Check backend logs via:

```text
GET /api/logs?limit=50&app_limit=50
```

Inspect `app_logs` (`scope`, `path`, `status`, `details`) — this is the primary source for root cause.

### Telegram notifications are not being sent

1. Make sure the device is assigned to at least one bot.
2. The bot must have at least one active chat (`isActive=true`).
3. Check `logs` in `/api/logs`:
	 - `status=failed` + `last_error` — current failure reason,
	 - `next_attempt_at` — when the next retry will run (backoff).

### NetBox settings are not saved

Check required fields:

- `netbox_url`
- `netbox_token`

If values are present but the error remains, inspect `app_logs` in `/api/logs` and the error text in `details`.

## Backend (Internal Architecture)

Current backend structure after refactoring:

- `src/index.ts` — thin entrypoint (runtime init + `fetch` export).
- `src/app.ts` — Hono app assembly, middleware, error handler, fallback.
- `src/db/`
	- `entities.ts` — TypeORM entities,
	- `data-source.ts` — SQLite configuration and initialization.
- `src/routes/`
	- `index.ts` — centralized API registration,
	- `settings-netbox.ts`, `devices.ts`, `bots.ts`, `logs.ts`.
- `src/services/`
	- `settings.ts`, `netbox.ts`, `devices.ts`, `history.ts`,
	- `monitor.ts`, `telegram.ts`, `migrations.ts`, `runtime.ts`.
- `src/workers/scheduler.ts` — background monitor/telegram loops.
- `src/lib/app-logger.ts` — system-level error/exception logging.

This layout simplifies maintenance, testing, and future evolution without growing `index.ts`.

## Frontend (Internal Architecture)

Current frontend structure after step-by-step refactoring:

- `frontend/src/App.svelte` — layout + wiring (tabs, feature composition, orchestration).
- `frontend/src/lib/api/`
	- `client.ts` — shared fetch client,
	- `types.ts` — shared API/domain types.
- `frontend/src/lib/components/features/`
	- `DevicesFeature.svelte` — devices screen and NetBox settings,
	- `BotsFeature.svelte` — bots screen,
	- `BotSettingsDialog.svelte` — manage chats for selected bot,
	- `DeviceHistoryDialog.svelte` — history modal for selected device,
	- `HistoryFeatureContent.svelte` — history table content (periods/statuses/durations).
- `frontend/src/lib/stores/`
	- `preferences.ts` — theme + locale,
	- `toasts.ts` — global toast notifications,
	- `device-filters.ts` — device search/filter/sort.
- `frontend/src/lib/services/`
	- `app-data.ts` — data operations for `App` (load/sync/update/create/delete),
	- `device-ui.ts` — status and bot-assignment UI helpers.
- `frontend/src/lib/components/ui/` — shadcn-svelte primitives (Button, Dialog, Table, Switch, etc.).

This separation reduces `App.svelte` size, removes duplication, and makes feature growth safer without touching the whole screen.
