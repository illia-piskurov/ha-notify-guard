import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { Database } from 'bun:sqlite';

const app = new Hono();
const db = new Database("/data/notifications.db");

/**
 * DATABASE INITIALIZATION
 */
db.run(`
  CREATE TABLE IF NOT EXISTS bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    token TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY, 
    name TEXT NOT NULL,
    ip TEXT NOT NULL,
    has_modbus_tag INTEGER DEFAULT 0,
    monitor_ping INTEGER DEFAULT 0,
    monitor_modbus INTEGER DEFAULT 0,
    last_ping_status TEXT DEFAULT 'unknown',
    last_modbus_status TEXT DEFAULT 'unknown'
  )
`);

// Table to link devices to specific bots for notifications
db.run(`
  CREATE TABLE IF NOT EXISTS device_notifications (
    device_id INTEGER,
    bot_id INTEGER,
    PRIMARY KEY (device_id, bot_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    msg TEXT,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

/**
 * NETBOX SYNC LOGIC
 */
app.post('/api/netbox/sync', async (c) => {
  try {
    // In real app, fetch these from a 'settings' table
    const NETBOX_URL = "http://netbox.local/api";
    const TOKEN = "your_netbox_token";

    const response = await fetch(`${NETBOX_URL}/dcim/devices/`, {
      headers: { 'Authorization': `Token ${TOKEN}` }
    });
    const data: any = await response.json();

    const upsert = db.prepare(`
      INSERT INTO devices (id, name, ip, has_modbus_tag) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, ip=excluded.ip, has_modbus_tag=excluded.has_modbus_tag
    `);

    for (const dev of data.results) {
      const ip = dev.primary_ip?.address?.split('/')[0];
      const hasModbus = dev.tags?.some((t: any) => t.slug === 'modbus') ? 1 : 0;
      if (ip) upsert.run(dev.id, dev.display, ip, hasModbus);
    }

    return c.json({ success: true, count: data.results.length });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

/**
 * MONITORING WORKER (Logic Step 4)
 */
setInterval(async () => {
  const devices = db.query("SELECT * FROM devices WHERE monitor_ping = 1 OR monitor_modbus = 1").all() as any[];

  for (const dev of devices) {
    // 1. Check Ping
    const pingProc = Bun.spawn(["ping", "-c", "1", "-W", "1", dev.ip]);
    const currentPingStatus = (await pingProc.exited) === 0 ? 'online' : 'offline';

    // 2. Check Modbus (if enabled and tag exists)
    let currentModbusStatus = 'closed';
    if (dev.monitor_modbus && currentPingStatus === 'online') {
      try {
        const socket = await Bun.connect({ hostname: dev.ip, port: 502, connectTimeout: 1000 });
        currentModbusStatus = 'open';
        socket.end();
      } catch {
        currentModbusStatus = 'closed';
      }
    }

    // 3. ALERT LOGIC: Detection of state change (e.g., online -> offline)
    if (dev.last_ping_status === 'online' && currentPingStatus === 'offline') {
      triggerAlert(dev, `🚨 DEVICE DOWN: ${dev.name} (${dev.ip}) is unreachable by PING.`);
    }

    if (dev.monitor_modbus && dev.last_modbus_status === 'open' && currentModbusStatus === 'closed') {
      triggerAlert(dev, `⚠️ MODBUS DOWN: ${dev.name} (${dev.ip}) port 502 is closed.`);
    }

    // 4. Update state in DB
    db.prepare(`
      UPDATE devices 
      SET last_ping_status = ?, last_modbus_status = ? 
      WHERE id = ?
    `).run(currentPingStatus, currentModbusStatus, dev.id);
  }
}, 30000);

/**
 * Helper to queue notifications based on bot assignments
 */
function triggerAlert(device: any, message: any) {
  // Find all bots assigned to this device
  const assignedBots = db.query(`
    SELECT b.token, b.chat_id 
    FROM bots b 
    JOIN device_notifications dn ON b.id = dn.bot_id 
    WHERE dn.device_id = ?
  `).all(device.id) as any[];

  for (const bot of assignedBots) {
    // We add to the log queue, the Telegram worker will pick it up
    db.prepare("INSERT INTO logs (msg) VALUES (?)").run(`[${device.name}] ${message}`);
  }
}

// REST API for UI and Telegram Worker remains similar to previous version...
// app.get('/api/devices', ...)
// app.post('/api/devices/:id/assign-bot', ...)
// setInterval(telegramWorker, 5000)

export default { port: 8000, fetch: app.fetch };