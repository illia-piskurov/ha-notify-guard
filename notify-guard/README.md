# HA Notify Guard

HA Notify Guard is a device monitoring service for Home Assistant:

- pulls IP addresses from NetBox,
- checks availability via Ping and monitored TCP ports,
- sends Telegram notifications (multiple bots and chats),
- stores queue data and history in SQLite,
- retries delivery with backoff when internet connectivity is unstable.

## Features

- NetBox device sync from `ipam/ip-addresses` with pagination.
- Enable/disable Ping monitoring per device.
- Per-device port scanning and per-port monitoring.
- Assign devices to bots with reusable chat catalog and per-chat routing rules.
- Anti-spam alert logic: one outage notification per outage episode.
- Guaranteed delivery: Telegram queue with automatic retries.
- Device availability history (online/offline slices by period).
- Svelte web UI with EN/UA localization.

## Changelog

- See [../CHANGELOG.md](../CHANGELOG.md).