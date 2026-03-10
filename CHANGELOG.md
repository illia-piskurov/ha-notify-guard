# Changelog

## 1.1.1 - 2026-03-10

### Added
- Notification queue processing state (`processing`) with claim token metadata for safer worker execution.
- Database uniqueness constraint for inbound idempotency (`bot_id + chat_id + idempotency_key`).
- New reliability-focused test coverage:
  - Telegram worker claim/sent/failed flow
  - Stale `processing` recovery flow
  - Monitor transaction rollback behavior when alert queueing fails
  - Scheduler lock behavior for both monitor and Telegram workers
  - Concurrent inbound idempotency scenario

### Changed
- Telegram worker now uses atomic job claim into `processing` and clears claim metadata on completion.
- Telegram worker now recovers stale `processing` jobs and re-queues them for retry.
- Inbound enqueue path is hardened for SQLite contention (`SQLITE_BUSY` / locked database retry).
- Alert enqueue and alert-state updates in monitor cycle are now transactional to avoid partial writes during failures.

### Fixed
- Reduced duplicate-send risk caused by overlapping worker runs.
- Improved resilience against race conditions during concurrent inbound requests with identical idempotency keys.

## 1.1.0 - 2026-03-10

### Added
- Global chat catalog with reusable chats across bots.
- Bot-to-chat assignment UI (checkbox-based, no manual per-bot chat ID entry).
- Inline chat editing in Bots tab (name and chat ID).
- Per-device per-bot per-chat routing controls for alert delivery.
- Logs tab danger-zone action: one-click database reset.
- External API exposure support via add-on port mapping (`8000/tcp`).

### Changed
- Devices tab now keeps status focused on Ping, with port states managed in device dialog.
- Telegram alert routing now supports per-chat rules for:
  - Ping alerts
  - Port alerts

### Removed
- Legacy bot/chat migration layer and compatibility-only bot chat endpoints.
- Legacy schema fields tied to old model (`monitor_modbus`, `last_modbus_status`, old bot chat fields).