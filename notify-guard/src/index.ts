import 'reflect-metadata';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { serveStatic } from 'hono/bun';
import { Hono } from 'hono';
import {
    Column,
    CreateDateColumn,
    DataSource,
    Entity,
    In,
    PrimaryColumn,
    PrimaryGeneratedColumn,
    Repository,
    UpdateDateColumn,
} from 'typeorm';

@Entity('settings')
class Setting {
    @PrimaryColumn({ type: 'text' })
    key!: string;

    @Column({ type: 'text' })
    value!: string;
}

@Entity('bots')
class Bot {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'text' })
    name!: string;

    @Column({ type: 'text' })
    token!: string;

    @Column({ name: 'chat_id', type: 'text' })
    chatId!: string;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean;
}

@Entity('devices')
class Device {
    @PrimaryColumn({ type: 'integer' })
    id!: number;

    @Column({ type: 'text' })
    name!: string;

    @Column({ type: 'text' })
    ip!: string;

    @Column({ name: 'has_modbus_tag', type: 'boolean', default: false })
    hasModbusTag!: boolean;

    @Column({ name: 'monitor_ping', type: 'boolean', default: false })
    monitorPing!: boolean;

    @Column({ name: 'monitor_modbus', type: 'boolean', default: false })
    monitorModbus!: boolean;

    @Column({ name: 'last_ping_status', type: 'text', default: 'unknown' })
    lastPingStatus!: string;

    @Column({ name: 'last_modbus_status', type: 'text', default: 'unknown' })
    lastModbusStatus!: string;

    @Column({ name: 'last_seen_at', type: 'datetime', nullable: true })
    lastSeenAt!: Date | null;
}

@Entity('device_notifications')
class DeviceNotification {
    @PrimaryColumn({ name: 'device_id', type: 'integer' })
    deviceId!: number;

    @PrimaryColumn({ name: 'bot_id', type: 'integer' })
    botId!: number;
}

@Entity('notifications')
class Notification {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ name: 'bot_id', type: 'integer' })
    botId!: number;

    @Column({ type: 'text' })
    token!: string;

    @Column({ name: 'chat_id', type: 'text' })
    chatId!: string;

    @Column({ type: 'text' })
    message!: string;

    @Column({ type: 'text', default: 'pending' })
    status!: 'pending' | 'failed' | 'sent';

    @Column({ type: 'integer', default: 0 })
    attempts!: number;

    @Column({ name: 'last_error', type: 'text', nullable: true })
    lastError!: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;

    @Column({ name: 'sent_at', type: 'datetime', nullable: true })
    sentAt!: Date | null;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime', nullable: true })
    updatedAt!: Date | null;
}

@Entity('device_ping_history')
class DevicePingHistory {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ name: 'device_id', type: 'integer' })
    deviceId!: number;

    @Column({ type: 'text' })
    status!: 'online' | 'offline';

    @CreateDateColumn({ name: 'checked_at', type: 'datetime' })
    checkedAt!: Date;
}

type NetboxSettings = {
    netbox_url: string;
    netbox_token: string;
    poll_seconds: number;
};

type DeviceView = {
    id: number;
    name: string;
    ip: string;
    hasModbusTag: boolean;
    monitorPing: boolean;
    monitorModbus: boolean;
    lastPingStatus: string;
    lastModbusStatus: string;
    lastSeenAt: string | null;
    assignedBotIds: number[];
};

const app = new Hono();
const dbPath = existsSync('/data') ? '/data/notifications.db' : join(process.cwd(), 'data', 'notifications.db');
const DIST_ROOT = './dist';

mkdirSync(dirname(dbPath), { recursive: true });

const dataSource = new DataSource({
    type: 'sqlite',
    database: dbPath,
    entities: [Setting, Bot, Device, DeviceNotification, Notification, DevicePingHistory],
    synchronize: true,
    logging: false,
});

await initialize();

app.use('/assets/*', serveStatic({ root: DIST_ROOT }));

app.use('/api/*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');

    if (c.req.method === 'OPTIONS') {
        return c.body(null, 204);
    }

    return next();
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/settings/netbox', async (c) => {
    return c.json(await getNetboxSettings());
});

app.put('/api/settings/netbox', async (c) => {
    const body = await c.req.json<Partial<NetboxSettings>>();

    if (!body.netbox_url || !body.netbox_token) {
        return c.json({ success: false, error: 'netbox_url and netbox_token are required' }, 400);
    }

    const pollSeconds = Number(body.poll_seconds ?? 30);
    await upsertSetting('netbox_url', body.netbox_url.trim());
    await upsertSetting('netbox_token', body.netbox_token.trim());
    await upsertSetting('poll_seconds', String(Number.isNaN(pollSeconds) ? 30 : pollSeconds));

    return c.json({ success: true, settings: await getNetboxSettings() });
});

app.post('/api/netbox/sync', async (c) => {
    try {
        const settings = await getNetboxSettings();

        if (!settings.netbox_url || !settings.netbox_token) {
            return c.json({ success: false, error: 'NetBox settings are missing' }, 400);
        }

        const ipAddresses = await fetchNetboxIpAddresses(settings.netbox_url, settings.netbox_token);

        const deviceRepo = getRepo(Device);
        const mappingRepo = getRepo(DeviceNotification);
        const pingHistoryRepo = getRepo(DevicePingHistory);
        let synced = 0;
        const syncedIds = new Set<number>();

        for (const address of ipAddresses) {
            const ip = removeSubnetMask(address.address);
            if (!ip) {
                continue;
            }

            const hasModbusTag = (address.tags ?? []).some((tag) => {
                const value = (tag.slug ?? tag.name ?? '').toLowerCase();
                return value === 'modbus';
            });

            const name = (address.description ?? '').trim() || (address.dns_name ?? '').trim() || `IP ${ip}`;

            await deviceRepo.upsert(
                {
                    id: address.id,
                    name,
                    ip,
                    hasModbusTag,
                },
                ['id'],
            );

            synced += 1;
            syncedIds.add(address.id);
        }

        const existingDevices = await deviceRepo.find({ select: { id: true } });
        const staleDeviceIds = existingDevices
            .map((device) => device.id)
            .filter((id) => !syncedIds.has(id));

        if (staleDeviceIds.length > 0) {
            await mappingRepo.delete({ deviceId: In(staleDeviceIds) });
            await pingHistoryRepo.delete({ deviceId: In(staleDeviceIds) });
            await deviceRepo.delete({ id: In(staleDeviceIds) });
        }

        return c.json({
            success: true,
            synced,
            total: ipAddresses.length,
            removed: staleDeviceIds.length,
        });
    } catch (error) {
        return c.json({ success: false, error: toErrorMessage(error) }, 500);
    }
});

app.get('/api/devices', async (c) => {
    return c.json({ devices: await getDevices() });
});

app.get('/api/devices/:id/history', async (c) => {
    const id = Number(c.req.param('id'));
    const period = c.req.query('period') ?? '24h';
    const fromDate = getPeriodStartDate(period);
    const now = new Date();

    if (Number.isNaN(id)) {
        return c.json({ success: false, error: 'Invalid device id' }, 400);
    }

    const deviceRepo = getRepo(Device);
    const historyRepo = getRepo(DevicePingHistory);
    const device = await deviceRepo.findOneBy({ id });

    if (!device) {
        return c.json({
            success: true,
            exists: false,
            period,
            device: null,
            history: [],
            slices: [],
        });
    }

    const MAX_EVENTS = 5000;

    let events = await historyRepo.find({
        where: { deviceId: id },
        order: { checkedAt: 'ASC' },
        take: MAX_EVENTS,
    });

    if (fromDate) {
        const previous = await historyRepo
            .createQueryBuilder('event')
            .where('event.device_id = :id', { id })
            .andWhere('event.checked_at < :fromDate', { fromDate: fromDate.toISOString() })
            .orderBy('event.checked_at', 'DESC')
            .limit(1)
            .getOne();

        events = events.filter((event) => event.checkedAt >= fromDate && event.checkedAt <= now);

        if (previous) {
            events = [previous, ...events];
        }
    }

    const slices = buildPingAvailabilitySlices(events, fromDate, now);

    return c.json({
        success: true,
        exists: true,
        period,
        device: {
            id: device.id,
            name: device.name,
            ip: device.ip,
            monitorPing: device.monitorPing,
        },
        history: events.map((item) => ({
            status: item.status,
            checkedAt: item.checkedAt.toISOString(),
        })),
        slices,
    });
});

app.patch('/api/devices/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const body = await c.req.json<{
        monitorPing?: boolean;
        monitorModbus?: boolean;
        assignedBotIds?: number[];
    }>();

    if (Number.isNaN(id)) {
        return c.json({ success: false, error: 'Invalid device id' }, 400);
    }

    const deviceRepo = getRepo(Device);
    const mappingRepo = getRepo(DeviceNotification);

    const existing = await deviceRepo.findOneBy({ id });
    if (!existing) {
        return c.json({ success: false, error: 'Device not found' }, 404);
    }

    if (typeof body.monitorPing === 'boolean') {
        existing.monitorPing = body.monitorPing;
    }

    if (typeof body.monitorModbus === 'boolean') {
        existing.monitorModbus = existing.hasModbusTag ? body.monitorModbus : false;
    }

    await deviceRepo.save(existing);

    if (Array.isArray(body.assignedBotIds)) {
        await mappingRepo.delete({ deviceId: id });

        const botIds = [...new Set(body.assignedBotIds)].filter((value) => Number.isInteger(value));
        const entities = botIds.map((botId) => mappingRepo.create({ deviceId: id, botId }));
        if (entities.length > 0) {
            await mappingRepo.save(entities);
        }
    }

    const updated = (await getDevices()).find((device) => device.id === id);
    return c.json({ success: true, device: updated });
});

app.get('/api/bots', async (c) => {
    const botRepo = getRepo(Bot);
    const bots = await botRepo.find({ order: { id: 'DESC' } });

    return c.json({
        bots: bots.map((bot) => ({
            id: bot.id,
            name: bot.name,
            chatId: bot.chatId,
            isActive: bot.isActive,
        })),
    });
});

app.post('/api/bots', async (c) => {
    const body = await c.req.json<{ name?: string; token?: string; chatId?: string; isActive?: boolean }>();

    if (!body.name?.trim() || !body.token?.trim() || !body.chatId?.trim()) {
        return c.json({ success: false, error: 'name, token and chatId are required' }, 400);
    }

    const botRepo = getRepo(Bot);
    const entity = botRepo.create({
        name: body.name.trim(),
        token: body.token.trim(),
        chatId: body.chatId.trim(),
        isActive: body.isActive !== false,
    });

    const created = await botRepo.save(entity);
    return c.json({ success: true, id: created.id });
});

app.patch('/api/bots/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const body = await c.req.json<{ name?: string; token?: string; chatId?: string; isActive?: boolean }>();

    if (Number.isNaN(id)) {
        return c.json({ success: false, error: 'Invalid bot id' }, 400);
    }

    const botRepo = getRepo(Bot);
    const bot = await botRepo.findOneBy({ id });

    if (!bot) {
        return c.json({ success: false, error: 'Bot not found' }, 404);
    }

    bot.name = body.name?.trim() || bot.name;
    bot.token = body.token?.trim() || bot.token;
    bot.chatId = body.chatId?.trim() || bot.chatId;
    bot.isActive = typeof body.isActive === 'boolean' ? body.isActive : bot.isActive;

    await botRepo.save(bot);
    return c.json({ success: true });
});

app.delete('/api/bots/:id', async (c) => {
    const id = Number(c.req.param('id'));

    if (Number.isNaN(id)) {
        return c.json({ success: false, error: 'Invalid bot id' }, 400);
    }

    const mappingRepo = getRepo(DeviceNotification);
    const botRepo = getRepo(Bot);

    await mappingRepo.delete({ botId: id });
    await botRepo.delete({ id });

    return c.json({ success: true });
});

app.get('/api/logs', async (c) => {
    const limitRaw = Number(c.req.query('limit') ?? 50);
    const limit = Number.isNaN(limitRaw) ? 50 : Math.min(Math.max(limitRaw, 1), 200);

    const notificationRepo = getRepo(Notification);
    const rows = await notificationRepo.find({
        order: { id: 'DESC' },
        take: limit,
    });

    return c.json({
        logs: rows.map((row) => ({
            id: row.id,
            message: row.message,
            status: row.status,
            attempts: row.attempts,
            last_error: row.lastError,
            created_at: toDateValue(row.createdAt),
            sent_at: toDateValue(row.sentAt),
        })),
    });
});

app.get('*', (c) => {
    const indexPath = `${DIST_ROOT}/index.html`;
    if (existsSync(indexPath)) {
        return c.html(readFileSync(indexPath, 'utf-8'));
    }

    return c.text('Frontend build not found. Run frontend build first.', 404);
});

async function initialize() {
    if (!dataSource.isInitialized) {
        await dataSource.initialize();
    }

    setInterval(() => {
        runMonitorCycle().catch((error) => {
            console.error('monitor cycle failed:', error);
        });
    }, 30_000);

    setInterval(() => {
        runTelegramWorker().catch((error) => {
            console.error('telegram worker failed:', error);
        });
    }, 5_000);
}

async function runMonitorCycle() {
    const deviceRepo = getRepo(Device);
    const devices = await deviceRepo.find({
        where: [{ monitorPing: true }, { monitorModbus: true }],
    });

    for (const device of devices) {
        const pingEnabled = device.monitorPing;
        const modbusEnabled = device.monitorModbus && device.hasModbusTag;

        const currentPingStatus = pingEnabled ? await probePing(device.ip) : 'disabled';
        const currentModbusStatus = modbusEnabled ? await probeModbus(device.ip) : 'disabled';

        if (currentPingStatus === 'online' || currentPingStatus === 'offline') {
            await recordPingHistoryIfChanged(device.id, currentPingStatus);
        }

        if (pingEnabled && device.lastPingStatus === 'online' && currentPingStatus === 'offline') {
            await queueAlert(device, `🚨 Ping fail: ${device.name} (${device.ip}) is unreachable`);
        }

        if (modbusEnabled && device.lastModbusStatus === 'open' && currentModbusStatus === 'closed') {
            await queueAlert(device, `⚠️ Modbus fail: ${device.name} (${device.ip}) TCP/502 is closed`);
        }

        device.lastPingStatus = currentPingStatus;
        device.lastModbusStatus = currentModbusStatus;
        device.lastSeenAt = new Date();

        await deviceRepo.save(device);
    }
}

async function recordPingHistoryIfChanged(deviceId: number, status: 'online' | 'offline') {
    const historyRepo = getRepo(DevicePingHistory);
    const last = await historyRepo.findOne({
        where: { deviceId },
        order: { checkedAt: 'DESC' },
    });

    if (last?.status === status) {
        return;
    }

    await historyRepo.save(historyRepo.create({
        deviceId,
        status,
    }));
}

async function runTelegramWorker() {
    const notificationRepo = getRepo(Notification);
    const jobs = await notificationRepo
        .createQueryBuilder('notification')
        .where('(notification.status = :pending OR notification.status = :failed)', {
            pending: 'pending',
            failed: 'failed',
        })
        .andWhere('notification.attempts < :maxAttempts', { maxAttempts: 5 })
        .orderBy('notification.id', 'ASC')
        .limit(20)
        .getMany();

    for (const job of jobs) {
        try {
            const response = await fetch(`https://api.telegram.org/bot${job.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: job.chatId,
                    text: job.message,
                }),
            });

            if (!response.ok) {
                throw new Error(`Telegram API ${response.status}`);
            }

            job.status = 'sent';
            job.sentAt = new Date();
            job.attempts += 1;
            job.lastError = null;
            await notificationRepo.save(job);
        } catch (error) {
            job.status = 'failed';
            job.attempts += 1;
            job.lastError = toErrorMessage(error);
            await notificationRepo.save(job);
        }
    }
}

async function queueAlert(device: Device, message: string) {
    const mappingRepo = getRepo(DeviceNotification);
    const botRepo = getRepo(Bot);
    const notificationRepo = getRepo(Notification);

    const mappings = await mappingRepo.findBy({ deviceId: device.id });
    if (mappings.length === 0) {
        return;
    }

    const botIds = mappings.map((item) => item.botId);
    const activeBots = await botRepo.find({
        where: {
            id: In(botIds),
            isActive: true,
        },
    });

    if (activeBots.length === 0) {
        return;
    }

    const notifications = activeBots.map((bot) =>
        notificationRepo.create({
            botId: bot.id,
            token: bot.token,
            chatId: bot.chatId,
            message,
            status: 'pending',
            attempts: 0,
            sentAt: null,
            lastError: null,
        }),
    );

    await notificationRepo.save(notifications);
}

async function getDevices(): Promise<DeviceView[]> {
    const deviceRepo = getRepo(Device);
    const mappingRepo = getRepo(DeviceNotification);

    const [devices, mappings] = await Promise.all([
        deviceRepo.find({ order: { name: 'ASC' } }),
        mappingRepo.find(),
    ]);

    const map = new Map<number, number[]>();
    for (const mapping of mappings) {
        const list = map.get(mapping.deviceId) ?? [];
        list.push(mapping.botId);
        map.set(mapping.deviceId, list);
    }

    return devices.map((device) => ({
        id: device.id,
        name: device.name,
        ip: device.ip,
        hasModbusTag: device.hasModbusTag,
        monitorPing: device.monitorPing,
        monitorModbus: device.monitorModbus,
        lastPingStatus: device.lastPingStatus,
        lastModbusStatus: device.lastModbusStatus,
        lastSeenAt: toDateValue(device.lastSeenAt),
        assignedBotIds: map.get(device.id) ?? [],
    }));
}

async function getNetboxSettings(): Promise<NetboxSettings> {
    const settingRepo = getRepo(Setting);
    const rows = await settingRepo.findBy({
        key: In(['netbox_url', 'netbox_token', 'poll_seconds']),
    });

    const map = new Map(rows.map((row) => [row.key, row.value]));
    return {
        netbox_url: map.get('netbox_url') ?? '',
        netbox_token: map.get('netbox_token') ?? '',
        poll_seconds: Number(map.get('poll_seconds') ?? '30') || 30,
    };
}

async function upsertSetting(key: string, value: string) {
    const settingRepo = getRepo(Setting);
    await settingRepo.save(settingRepo.create({ key, value }));
}

function getRepo<T extends object>(entity: { new(): T }): Repository<T> {
    return dataSource.getRepository(entity);
}

async function probePing(ip: string): Promise<'online' | 'offline'> {
    const args = process.platform === 'win32'
        ? ['ping', '-n', '1', '-w', '1000', ip]
        : ['ping', '-c', '1', '-W', '1', ip];

    const proc = Bun.spawn(args, {
        stdout: 'ignore',
        stderr: 'ignore',
    });

    const code = await proc.exited;
    return code === 0 ? 'online' : 'offline';
}

async function probeModbus(ip: string): Promise<'open' | 'closed'> {
    return new Promise((resolve) => {
        const socket = new Socket();

        const finish = (status: 'open' | 'closed') => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(status);
        };

        socket.setTimeout(1000);
        socket.once('connect', () => finish('open'));
        socket.once('timeout', () => finish('closed'));
        socket.once('error', () => finish('closed'));

        socket.connect(502, ip);
    });
}

function toDateValue(value: Date | string | null): string | null {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return value;
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

type NetboxTag = {
    slug?: string;
    name?: string;
};

type NetboxIpAddress = {
    id: number;
    address: string;
    description?: string | null;
    dns_name?: string | null;
    tags?: NetboxTag[];
};

type NetboxIpAddressesPage = {
    results?: NetboxIpAddress[];
    next?: string | null;
};

type PingAvailabilitySlice = {
    status: 'online' | 'offline';
    startedAt: string;
    endedAt: string | null;
};

async function fetchNetboxIpAddresses(baseUrl: string, token: string): Promise<NetboxIpAddress[]> {
    const headers = {
        Authorization: `Token ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };

    const results: NetboxIpAddress[] = [];
    let url: string | null = buildNetboxIpamUrl(baseUrl);

    while (url) {
        const response = await fetch(url, { headers });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`NetBox sync failed: ${response.status}. ${body}`);
        }

        const page = await response.json() as NetboxIpAddressesPage;
        results.push(...(page.results ?? []));
        url = page.next ?? null;
    }

    return results;
}

function buildNetboxIpamUrl(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, '');

    if (normalized.endsWith('/api')) {
        return `${normalized}/ipam/ip-addresses/?limit=500`;
    }

    return `${normalized}/api/ipam/ip-addresses/?limit=500`;
}

function removeSubnetMask(ipAddress: string | null | undefined): string {
    return (ipAddress ?? '').split('/')[0]?.trim() ?? '';
}

function getPeriodStartDate(period: string): Date | null {
    const normalized = period.toLowerCase();
    const now = Date.now();

    if (normalized === 'all') {
        return null;
    }

    if (normalized === '24h') {
        return new Date(now - 24 * 60 * 60 * 1000);
    }

    if (normalized === '7d') {
        return new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    if (normalized === '30d') {
        return new Date(now - 30 * 24 * 60 * 60 * 1000);
    }

    return new Date(now - 24 * 60 * 60 * 1000);
}

function buildPingAvailabilitySlices(
    events: DevicePingHistory[],
    fromDate: Date | null,
    now: Date,
): PingAvailabilitySlice[] {
    if (events.length === 0) {
        return [];
    }

    const slices: PingAvailabilitySlice[] = [];

    for (const [index, current] of events.entries()) {
        const next = events[index + 1] ?? null;

        const start = fromDate && current.checkedAt < fromDate
            ? fromDate
            : current.checkedAt;

        const end = next
            ? next.checkedAt
            : (fromDate ? now : null);

        if (fromDate && end && end <= fromDate) {
            continue;
        }

        if (end && end <= start) {
            continue;
        }

        slices.push({
            status: current.status,
            startedAt: start.toISOString(),
            endedAt: end ? end.toISOString() : null,
        });
    }

    return slices;
}

export default { port: 8000, fetch: app.fetch };