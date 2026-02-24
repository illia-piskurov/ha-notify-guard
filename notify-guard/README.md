# notify-guard (backend)

Backend-сервис для HA Notify Guard.

## Stack

- Bun
- Hono
- TypeORM + SQLite

## Установка

```bash
bun install
```

## Запуск

Из корня репозитория:

```bash
bun run notify-guard/src/index.ts
```

## Форматирование и lint

```bash
bun run format
bun run lint
```

## Архитектура

- `src/index.ts` — entrypoint.
- `src/app.ts` — создание Hono app.
- `src/db/` — entities + datasource.
- `src/routes/` — HTTP API.
- `src/services/` — бизнес-логика.
- `src/workers/` — фоновые задачи.
- `src/lib/` — общие утилиты (логирование и т.д.).

## См. также

Полное описание продукта и API — в корневом README: `../README.md`.
