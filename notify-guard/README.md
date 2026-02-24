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