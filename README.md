# HA Notify Guard

HA Notify Guard — это сервис мониторинга устройств для Home Assistant:

- подтягивает IP-адреса из NetBox,
- проверяет доступность по Ping и Modbus TCP (502),
- отправляет уведомления в Telegram (несколько ботов и чатов),
- хранит очередь и историю в SQLite,
- делает ретраи отправки с backoff при проблемах с интернетом.

## Что умеет

- Синхронизация устройств из NetBox (`ipam/ip-addresses`) с пагинацией.
- Включение/выключение мониторинга Ping и Modbus для каждого устройства.
- Привязка устройств к ботам, поддержка нескольких чатов на одного бота.
- Анти-спам логика: уведомление об аварии один раз на эпизод падения.
- Guaranteed delivery: очередь Telegram-сообщений с повторными попытками.
- История доступности устройства (срезы online/offline за период).
- Веб-интерфейс на Svelte с локализацией EN/UA.

## Структура проекта

- `notify-guard/` — backend (Bun + Hono + TypeORM + SQLite).
- `notify-guard/frontend/` — frontend (Svelte + Vite + shadcn-svelte).

## Локальный запуск

### 1) Backend

```bash
cd notify-guard
bun install
```

Запуск (из корня репозитория):

```bash
bun run notify-guard/src/index.ts
```

Сервер поднимается на `http://localhost:8000`.

### 2) Frontend (dev)

```bash
cd notify-guard/frontend
bun install
bun run dev
```

Проверка типов фронтенда:

```bash
bun run check
```

## Основные API

- `GET /api/health` — healthcheck.
- `GET|PUT /api/settings/netbox` — настройки NetBox.
- `POST /api/netbox/sync` — синхронизация устройств.
- `GET /api/devices` — список устройств.
- `PATCH /api/devices/:id` — обновление мониторинга/назначений.
- `GET /api/devices/:id/history?period=24h|7d|30d|all` — история доступности.
- `GET /api/bots` и CRUD для ботов/чатов.
- `GET /api/logs?limit=...&app_limit=...` — очередь уведомлений + app logs.

## Логи и диагностика

`/api/logs` возвращает два блока:

- `logs` — Telegram-очередь (`status`, `attempts`, `last_error`, `next_attempt_at`).
- `app_logs` — системные backend-ошибки (`scope`, `path`, `status`, `details`).

Это помогает разбирать `HTTP 500` и проблемы отправки уведомлений постфактум.

## Roadmap

### MVP (уже реализовано)

- Синхронизация устройств из NetBox.
- Мониторинг Ping/Modbus по устройствам.
- Telegram-уведомления с очередью, ретраями и backoff.
- История доступности и базовая аналитика по периодам.
- Локализация интерфейса EN/UA.

### Next

- Вкладка/экран app logs во frontend (без ручных API-запросов).
- Улучшенный health endpoint (статус БД, состояние воркеров, длина очереди).
- Настраиваемые пороги/параметры retry policy через UI.
- Базовые e2e/интеграционные тесты для критичных API.

## Troubleshooting

### `EADDRINUSE` (порт 8000 уже занят)

Причина: уже запущен другой процесс backend.

Решение (PowerShell):

```powershell
$connection = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($connection) {
	$connection | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
		Stop-Process -Id $_ -Force
	}
}
```

После этого запустите backend снова:

```bash
bun run notify-guard/src/index.ts
```

### На фронте `HTTP 500`

Проверьте backend-логи через:

```text
GET /api/logs?limit=50&app_limit=50
```

Смотрите блок `app_logs` (`scope`, `path`, `status`, `details`) — это основной источник причины 500.

### Telegram не отправляет уведомления

1. Убедитесь, что устройство назначено хотя бы одному боту.
2. У бота должен быть хотя бы один активный chat (`isActive=true`).
3. Проверяйте `logs` в `/api/logs`:
	 - `status=failed` + `last_error` — текущая причина фейла,
	 - `next_attempt_at` — когда будет следующая попытка (backoff).

### Настройки NetBox не сохраняются

Проверьте обязательные поля:

- `netbox_url`
- `netbox_token`

Если значения заполнены, но ошибка сохраняется — смотрите `app_logs` в `/api/logs` и текст ошибки в `details`.

## Backend (внутренняя архитектура)

Текущая backend-структура после рефакторинга:

- `src/index.ts` — тонкий entrypoint (инициализация runtime + экспорт `fetch`).
- `src/app.ts` — сборка Hono-приложения, middleware, error handler, fallback.
- `src/db/`
	- `entities.ts` — TypeORM сущности,
	- `data-source.ts` — конфигурация и инициализация SQLite.
- `src/routes/`
	- `index.ts` — централизованная регистрация API,
	- `settings-netbox.ts`, `devices.ts`, `bots.ts`, `logs.ts`.
- `src/services/`
	- `settings.ts`, `netbox.ts`, `devices.ts`, `history.ts`,
	- `monitor.ts`, `telegram.ts`, `migrations.ts`, `runtime.ts`.
- `src/workers/scheduler.ts` — фоновые циклы monitor/telegram.
- `src/lib/app-logger.ts` — системное логирование ошибок/исключений.

Этот layout упрощает поддержку, тестирование и дальнейшее развитие без роста `index.ts`.
