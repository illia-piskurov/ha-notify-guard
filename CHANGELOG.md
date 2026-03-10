# Changelog

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