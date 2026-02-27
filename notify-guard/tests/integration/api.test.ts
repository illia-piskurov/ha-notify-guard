import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

type HealthResponse = { ok: boolean };

type NetboxSettingsResponse = {
    netbox_url: string;
    netbox_token: string;
    poll_seconds: number;
};

type SuccessResponse = {
    success: boolean;
    error?: string;
};

type CreateBotResponse = {
    success: boolean;
    id: number;
};

type BotsListResponse = {
    bots: Array<{ id: number; chatCount: number; activeChatCount: number }>;
};

type DevicesListResponse = {
    devices: unknown[];
};

type DevicePortItem = {
    deviceId: number;
    port: number;
    label: string;
    monitorEnabled: boolean;
    lastStatus: string;
    lastScannedAt: string | null;
};

type DevicePortsResponse = {
    success: boolean;
    ports: DevicePortItem[];
    error?: string;
};

type DevicePortsScanResponse = {
    success: boolean;
    scannedAt: string;
    openPorts: Array<{ port: number; label: string; status: 'open' | 'closed' }>;
    ports: DevicePortItem[];
    error?: string;
};

type LogsResponse = {
    logs: unknown[];
    app_logs: unknown[];
};

type InboundResponse = {
    success: boolean;
    deduplicated: boolean;
    queued: number;
    notification_ids: number[];
    error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}

describe('Notify Guard API integration', () => {
    const testDbPath = join(process.cwd(), 'data', 'notifications.test.db');

    let app: ReturnType<(typeof import('../../src/app'))['createApp']>;
    let dataSource: (typeof import('../../src/db/data-source'))['dataSource'];
    let Bot: (typeof import('../../src/db/entities'))['Bot'];
    let BotChat: (typeof import('../../src/db/entities'))['BotChat'];
    let Device: (typeof import('../../src/db/entities'))['Device'];

    beforeAll(async () => {
        process.env.NOTIFY_GUARD_DB_PATH = testDbPath;

        const appModule = await import('../../src/app');
        const dataSourceModule = await import('../../src/db/data-source');
        const entitiesModule = await import('../../src/db/entities');

        app = appModule.createApp();
        dataSource = dataSourceModule.dataSource;
        Bot = entitiesModule.Bot;
        BotChat = entitiesModule.BotChat;
        Device = entitiesModule.Device;

        if (!dataSource.isInitialized) {
            await dataSource.initialize();
        }
    });

    beforeEach(async () => {
        await dataSource.synchronize(true);
    });

    afterAll(async () => {
        if (dataSource.isInitialized) {
            await dataSource.destroy();
        }

        if (existsSync(testDbPath)) {
            unlinkSync(testDbPath);
        }
    });

    it('GET /api/health returns ok', async () => {
        const response = await app.request('/api/health');
        expect(response.status).toBe(200);

        const payload = await readJson<HealthResponse>(response);
        expect(payload.ok).toBe(true);
    });

    it('GET/PUT /api/settings/netbox stores and returns settings', async () => {
        const update = await app.request('/api/settings/netbox', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                netbox_url: 'https://netbox.local/api',
                netbox_token: 'secret-token',
                poll_seconds: 45,
            }),
        });

        expect(update.status).toBe(200);
        const updatePayload = await readJson<SuccessResponse>(update);
        expect(updatePayload.success).toBe(true);

        const getResponse = await app.request('/api/settings/netbox');
        expect(getResponse.status).toBe(200);
        const getPayload = await readJson<NetboxSettingsResponse>(getResponse);
        expect(getPayload.netbox_url).toBe('https://netbox.local/api');
        expect(getPayload.netbox_token).toBe('secret-token');
        expect(getPayload.poll_seconds).toBe(45);
    });

    it('bots API creates bot and reports chat counts', async () => {
        const created = await app.request('/api/bots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'MainBot',
                token: 'bot-token-1',
            }),
        });

        expect(created.status).toBe(200);
        const createdPayload = await readJson<CreateBotResponse>(created);
        const botId = createdPayload.id;

        await app.request(`/api/bots/${botId}/chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: '111', isActive: true }),
        });

        await app.request(`/api/bots/${botId}/chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: '222', isActive: false }),
        });

        const list = await app.request('/api/bots');
        expect(list.status).toBe(200);
        const listPayload = await readJson<BotsListResponse>(list);

        const bot = listPayload.bots.find((item) => item.id === botId);

        expect(bot).toBeDefined();
        expect(bot?.chatCount).toBe(2);
        expect(bot?.activeChatCount).toBe(1);
    });

    it('GET /api/devices and /api/logs return expected payload shape', async () => {
        const devicesResponse = await app.request('/api/devices');
        expect(devicesResponse.status).toBe(200);
        const devicesPayload = await readJson<DevicesListResponse>(devicesResponse);
        expect(Array.isArray(devicesPayload.devices)).toBe(true);

        const logsResponse = await app.request('/api/logs?limit=10&app_limit=10');
        expect(logsResponse.status).toBe(200);
        const logsPayload = await readJson<LogsResponse>(logsResponse);
        expect(Array.isArray(logsPayload.logs)).toBe(true);
        expect(Array.isArray(logsPayload.app_logs)).toBe(true);
    });

    it('inbound returns 400 when idempotency_key is missing', async () => {
        const response = await app.request('/api/inbound/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bot_name: 'MainBot',
                text: 'hello',
            }),
        });

        expect(response.status).toBe(400);
        const payload = await readJson<SuccessResponse>(response);
        expect(payload.success).toBe(false);
        expect(payload.error).toContain('idempotency_key');
    });

    it('inbound queues all active chats and deduplicates by idempotency_key', async () => {
        await seedBotWithChats({
            name: 'MainBot',
            chats: [
                { chatId: '111', isActive: true },
                { chatId: '222', isActive: true },
                { chatId: '333', isActive: false },
            ],
        });

        const first = await app.request('/api/inbound/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bot_name: 'MainBot',
                text: 'from test',
                source: 'bun-test',
                idempotency_key: 'same-key-1',
            }),
        });

        expect(first.status).toBe(202);
        const firstPayload = await readJson<InboundResponse>(first);
        expect(firstPayload.success).toBe(true);
        expect(firstPayload.deduplicated).toBe(false);
        expect(firstPayload.queued).toBe(2);
        expect(firstPayload.notification_ids.length).toBe(2);

        const second = await app.request('/api/inbound/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bot_name: 'MainBot',
                text: 'from test',
                source: 'bun-test',
                idempotency_key: 'same-key-1',
            }),
        });

        expect(second.status).toBe(202);
        const secondPayload = await readJson<InboundResponse>(second);
        expect(secondPayload.success).toBe(true);
        expect(secondPayload.deduplicated).toBe(true);
        expect(secondPayload.queued).toBe(0);
        expect(secondPayload.notification_ids).toEqual(firstPayload.notification_ids);
    });

    it('inbound with chat_id targets only one active chat', async () => {
        await seedBotWithChats({
            name: 'MainBot',
            chats: [
                { chatId: '111', isActive: true },
                { chatId: '222', isActive: true },
            ],
        });

        const response = await app.request('/api/inbound/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bot_name: 'MainBot',
                chat_id: '222',
                text: 'single target',
                idempotency_key: 'chat-only-222',
            }),
        });

        expect(response.status).toBe(202);
        const payload = await readJson<InboundResponse>(response);
        expect(payload.success).toBe(true);
        expect(payload.queued).toBe(1);
        expect(payload.deduplicated).toBe(false);
        expect(payload.notification_ids.length).toBe(1);
    });

    it('inbound returns 404 for unknown bot_name', async () => {
        const response = await app.request('/api/inbound/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bot_name: 'UnknownBot',
                text: 'hello',
                idempotency_key: 'unknown-bot-test',
            }),
        });

        expect(response.status).toBe(404);
        const payload = await readJson<SuccessResponse>(response);
        expect(payload.success).toBe(false);
    });

    it('inbound returns 404 if bot has no active chats', async () => {
        await seedBotWithChats({
            name: 'MainBot',
            chats: [{ chatId: '111', isActive: false }],
        });

        const response = await app.request('/api/inbound/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bot_name: 'MainBot',
                text: 'no active chats',
                idempotency_key: 'no-active-chats-test',
            }),
        });

        expect(response.status).toBe(404);
        const payload = await readJson<SuccessResponse>(response);
        expect(payload.success).toBe(false);
    });

    it('GET /api/devices/:id/ports and known scan return port rows', async () => {
        await seedDevice({ id: 1001, name: 'Switch A', ip: '127.0.0.1' });

        const beforeScan = await app.request('/api/devices/1001/ports');
        expect(beforeScan.status).toBe(200);
        const beforePayload = await readJson<DevicePortsResponse>(beforeScan);
        expect(beforePayload.success).toBe(true);
        expect(beforePayload.ports.length).toBe(0);

        const scan = await app.request('/api/devices/1001/ports/scan', {
            method: 'POST',
        });
        expect(scan.status).toBe(200);
        const scanPayload = await readJson<DevicePortsScanResponse>(scan);
        expect(scanPayload.success).toBe(true);
        expect(scanPayload.ports.length).toBeGreaterThanOrEqual(8);

        const afterScan = await app.request('/api/devices/1001/ports');
        expect(afterScan.status).toBe(200);
        const afterPayload = await readJson<DevicePortsResponse>(afterScan);
        expect(afterPayload.success).toBe(true);
        expect(afterPayload.ports.length).toBeGreaterThanOrEqual(8);
    });

    it('custom closed unknown port is not persisted by scan-custom', async () => {
        await seedDevice({ id: 1002, name: 'Offline Host', ip: '203.0.113.10' });

        const scan = await app.request('/api/devices/1002/ports/scan-custom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port: 2163 }),
        });

        expect(scan.status).toBe(200);
        const scanPayload = await readJson<DevicePortsScanResponse>(scan);
        expect(scanPayload.success).toBe(true);

        const listed = await app.request('/api/devices/1002/ports');
        expect(listed.status).toBe(200);
        const listedPayload = await readJson<DevicePortsResponse>(listed);
        expect(listedPayload.success).toBe(true);
        expect(listedPayload.ports.some((item) => item.port === 2163)).toBe(false);
    });

    it('custom port can be toggled and deleted; known port cannot be deleted', async () => {
        await seedDevice({ id: 1003, name: 'Router A', ip: '127.0.0.1' });

        const enableCustom = await app.request('/api/devices/1003/ports/2163', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monitorEnabled: true }),
        });
        expect(enableCustom.status).toBe(200);
        const enablePayload = await readJson<DevicePortsResponse>(enableCustom);
        expect(enablePayload.success).toBe(true);
        expect(enablePayload.ports.some((item) => item.port === 2163 && item.monitorEnabled)).toBe(true);

        const deleteWhileEnabled = await app.request('/api/devices/1003/ports/2163', {
            method: 'DELETE',
        });
        expect(deleteWhileEnabled.status).toBe(400);

        const disableCustom = await app.request('/api/devices/1003/ports/2163', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monitorEnabled: false }),
        });
        expect(disableCustom.status).toBe(200);

        const deleteCustom = await app.request('/api/devices/1003/ports/2163', {
            method: 'DELETE',
        });
        expect(deleteCustom.status).toBe(200);
        const deletePayload = await readJson<DevicePortsResponse>(deleteCustom);
        expect(deletePayload.success).toBe(true);
        expect(deletePayload.ports.some((item) => item.port === 2163)).toBe(false);

        await app.request('/api/devices/1003/ports/scan', { method: 'POST' });

        const deleteKnown = await app.request('/api/devices/1003/ports/80', {
            method: 'DELETE',
        });
        expect(deleteKnown.status).toBe(400);
    });

    async function seedBotWithChats(input: {
        name: string;
        chats: Array<{ chatId: string; isActive: boolean }>;
    }) {
        const botRepo = dataSource.getRepository(Bot);
        const chatRepo = dataSource.getRepository(BotChat);

        const bot = await botRepo.save(
            botRepo.create({
                name: input.name,
                token: 'test-token',
                chatId: '',
                isActive: true,
            }),
        );

        await chatRepo.save(
            input.chats.map((chat) =>
                chatRepo.create({
                    botId: bot.id,
                    chatId: chat.chatId,
                    isActive: chat.isActive,
                }),
            ),
        );

        return bot;
    }

    async function seedDevice(input: { id: number; name: string; ip: string }) {
        const deviceRepo = dataSource.getRepository(Device);

        return deviceRepo.save(
            deviceRepo.create({
                id: input.id,
                name: input.name,
                ip: input.ip,
                hasModbusTag: false,
                monitorPing: false,
                monitorModbus: false,
                lastPingStatus: 'unknown',
                lastModbusStatus: 'unknown',
                lastSeenAt: null,
            }),
        );
    }
});
