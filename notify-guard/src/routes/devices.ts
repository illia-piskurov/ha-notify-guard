import type { Hono } from 'hono';
import { In } from 'typeorm';
import { dataSource } from '../db/data-source';
import { BotChat, Chat, Device, DeviceNotification, DeviceNotificationTarget, DevicePingHistory, DevicePortMonitor } from '../db/entities';
import { getDevices } from '../services/devices';
import { getDevicePorts, knownScanPorts, probeTcpPort, resolveKnownPort } from '../services/device-ports';
import { buildPingAvailabilitySlices, getPeriodStartDate, toValidDate } from '../services/history';

export function registerDevicesRoutes(app: Hono) {
    app.get('/api/devices', async (c) => c.json({ devices: await getDevices() }));

    app.get('/api/devices/:id/bots/:botId/chats', async (c) => {
        const id = Number(c.req.param('id'));
        const botId = Number(c.req.param('botId'));

        if (Number.isNaN(id) || Number.isNaN(botId)) {
            return c.json({ success: false, error: 'Invalid route params' }, 400);
        }

        const deviceRepo = dataSource.getRepository(Device);
        const mappingRepo = dataSource.getRepository(DeviceNotification);
        const botChatRepo = dataSource.getRepository(BotChat);
        const chatRepo = dataSource.getRepository(Chat);
        const targetRepo = dataSource.getRepository(DeviceNotificationTarget);

        const [device, mapping] = await Promise.all([
            deviceRepo.findOneBy({ id }),
            mappingRepo.findOneBy({ deviceId: id, botId }),
        ]);

        if (!device) {
            return c.json({ success: false, error: 'Device not found' }, 404);
        }

        if (!mapping) {
            return c.json({ success: false, error: 'Bot is not assigned to this device' }, 404);
        }

        const assignments = await botChatRepo.find({
            where: { botId, isActive: true },
            order: { id: 'DESC' },
        });

        const chatRefIds = assignments
            .map((item) => item.chatRefId)
            .filter((value): value is number => typeof value === 'number');

        const catalog = chatRefIds.length > 0
            ? await chatRepo.findBy({ id: In(chatRefIds), isActive: true })
            : [];
        const catalogById = new Map(catalog.map((item) => [item.id, item]));

        const targets = await targetRepo.findBy({ deviceId: id, botId });
        const targetByChatRefId = new Map(targets.map((item) => [item.chatRefId, item]));

        const chats = assignments
            .map((assignment) => {
                const ref = assignment.chatRefId ? catalogById.get(assignment.chatRefId) : null;
                if (!ref || !assignment.chatRefId) {
                    return null;
                }

                const target = targetByChatRefId.get(assignment.chatRefId);
                return {
                    id: ref.id,
                    chatId: ref.chatId,
                    name: ref.name,
                    pingEnabled: target?.pingEnabled ?? true,
                    portEnabled: target?.portEnabled ?? true,
                };
            })
            .filter((item): item is {
                id: number;
                chatId: string;
                name: string;
                pingEnabled: boolean;
                portEnabled: boolean;
            } => item !== null);

        return c.json({ success: true, chats });
    });

    app.patch('/api/devices/:id/bots/:botId/chats/:chatId', async (c) => {
        const id = Number(c.req.param('id'));
        const botId = Number(c.req.param('botId'));
        const chatId = Number(c.req.param('chatId'));
        const body = await c.req.json<{ pingEnabled?: boolean; portEnabled?: boolean }>();

        if (Number.isNaN(id) || Number.isNaN(botId) || Number.isNaN(chatId)) {
            return c.json({ success: false, error: 'Invalid route params' }, 400);
        }

        if (typeof body.pingEnabled !== 'boolean' || typeof body.portEnabled !== 'boolean') {
            return c.json({ success: false, error: 'pingEnabled and portEnabled are required' }, 400);
        }

        const deviceRepo = dataSource.getRepository(Device);
        const mappingRepo = dataSource.getRepository(DeviceNotification);
        const botChatRepo = dataSource.getRepository(BotChat);
        const targetRepo = dataSource.getRepository(DeviceNotificationTarget);

        const [device, mapping, assignment] = await Promise.all([
            deviceRepo.findOneBy({ id }),
            mappingRepo.findOneBy({ deviceId: id, botId }),
            botChatRepo.findOneBy({ botId, chatRefId: chatId, isActive: true }),
        ]);

        if (!device) {
            return c.json({ success: false, error: 'Device not found' }, 404);
        }

        if (!mapping) {
            return c.json({ success: false, error: 'Bot is not assigned to this device' }, 404);
        }

        if (!assignment) {
            return c.json({ success: false, error: 'Chat is not active for this bot' }, 404);
        }

        const existing = await targetRepo.findOneBy({
            deviceId: id,
            botId,
            chatRefId: chatId,
        });

        const target = existing ?? targetRepo.create({
            deviceId: id,
            botId,
            chatRefId: chatId,
            pingEnabled: true,
            portEnabled: true,
        });

        target.pingEnabled = body.pingEnabled;
        target.portEnabled = body.portEnabled;
        await targetRepo.save(target);

        return c.json({ success: true });
    });

    app.get('/api/devices/:id/ports', async (c) => {
        const id = Number(c.req.param('id'));
        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid device id' }, 400);
        }

        const deviceRepo = dataSource.getRepository(Device);
        const device = await deviceRepo.findOneBy({ id });
        if (!device) {
            return c.json({ success: false, error: 'Device not found' }, 404);
        }

        const ports = await getDevicePorts(id);
        return c.json({ success: true, ports });
    });

    app.post('/api/devices/:id/ports/scan', async (c) => {
        const id = Number(c.req.param('id'));
        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid device id' }, 400);
        }

        const deviceRepo = dataSource.getRepository(Device);
        const portRepo = dataSource.getRepository(DevicePortMonitor);
        const device = await deviceRepo.findOneBy({ id });
        if (!device) {
            return c.json({ success: false, error: 'Device not found' }, 404);
        }

        const scanPorts = knownScanPorts();
        const scanned = await Promise.all(scanPorts.map(async (port) => {
            const known = resolveKnownPort(port);

            return {
                port,
                label: known?.label ?? `TCP ${port}`,
                status: await probeTcpPort(device.ip, port),
            };
        }));

        const now = new Date();
        for (const item of scanned) {
            let row = await portRepo.findOneBy({ deviceId: id, port: item.port });

            if (!row) {
                row = portRepo.create({
                    deviceId: id,
                    port: item.port,
                    label: item.label,
                    monitorEnabled: false,
                    lastStatus: item.status,
                    lastScannedAt: now,
                });
            } else {
                row.label = item.label;
                row.lastStatus = item.status;
                row.lastScannedAt = now;
            }

            await portRepo.save(row);
        }

        const openPorts = scanned.filter((item) => item.status === 'open');
        const ports = await getDevicePorts(id);

        return c.json({
            success: true,
            scannedAt: now.toISOString(),
            openPorts,
            ports,
        });
    });

    app.post('/api/devices/:id/ports/scan-custom', async (c) => {
        const id = Number(c.req.param('id'));
        const body = await c.req.json<{ port?: number }>();

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid device id' }, 400);
        }

        const port = Number(body.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return c.json({ success: false, error: 'Port must be an integer in range 1..65535' }, 400);
        }

        const deviceRepo = dataSource.getRepository(Device);
        const portRepo = dataSource.getRepository(DevicePortMonitor);
        const device = await deviceRepo.findOneBy({ id });
        if (!device) {
            return c.json({ success: false, error: 'Device not found' }, 404);
        }

        const status = await probeTcpPort(device.ip, port);
        const known = resolveKnownPort(port);
        const now = new Date();

        const existing = await portRepo.findOneBy({ deviceId: id, port });
        const shouldPersist = status === 'open' || Boolean(known) || Boolean(existing?.monitorEnabled);

        if (shouldPersist) {
            const row = existing ?? portRepo.create({
                deviceId: id,
                port,
                label: known?.label ?? `TCP ${port}`,
                monitorEnabled: false,
                lastStatus: 'unknown',
                lastScannedAt: null,
            });

            row.label = known?.label ?? row.label;
            row.lastStatus = status;
            row.lastScannedAt = now;
            await portRepo.save(row);
        } else if (existing && !existing.monitorEnabled && !known) {
            await portRepo.delete({ deviceId: id, port });
        }

        const ports = await getDevicePorts(id);
        const openPorts = ports.filter((item) => item.lastStatus === 'open');

        return c.json({
            success: true,
            scannedAt: now.toISOString(),
            openPorts,
            ports,
        });
    });

    app.delete('/api/devices/:id/ports/:port', async (c) => {
        const id = Number(c.req.param('id'));
        const port = Number(c.req.param('port'));

        if (Number.isNaN(id) || Number.isNaN(port)) {
            return c.json({ success: false, error: 'Invalid route params' }, 400);
        }

        const knownPort = resolveKnownPort(port);
        if (knownPort) {
            return c.json({ success: false, error: 'Known ports cannot be deleted' }, 400);
        }

        const deviceRepo = dataSource.getRepository(Device);
        const portRepo = dataSource.getRepository(DevicePortMonitor);

        const device = await deviceRepo.findOneBy({ id });
        if (!device) {
            return c.json({ success: false, error: 'Device not found' }, 404);
        }

        const row = await portRepo.findOneBy({ deviceId: id, port });
        if (!row) {
            return c.json({ success: false, error: 'Port not found' }, 404);
        }

        if (row.monitorEnabled) {
            return c.json({ success: false, error: 'Disable monitoring before deleting port' }, 400);
        }

        await portRepo.delete({ deviceId: id, port });

        const ports = await getDevicePorts(id);
        return c.json({ success: true, ports });
    });

    app.patch('/api/devices/:id/ports/:port', async (c) => {
        const id = Number(c.req.param('id'));
        const port = Number(c.req.param('port'));
        const body = await c.req.json<{ monitorEnabled?: boolean }>();

        if (Number.isNaN(id) || Number.isNaN(port)) {
            return c.json({ success: false, error: 'Invalid route params' }, 400);
        }

        if (typeof body.monitorEnabled !== 'boolean') {
            return c.json({ success: false, error: 'monitorEnabled is required' }, 400);
        }

        const deviceRepo = dataSource.getRepository(Device);
        const portRepo = dataSource.getRepository(DevicePortMonitor);

        const device = await deviceRepo.findOneBy({ id });
        if (!device) {
            return c.json({ success: false, error: 'Device not found' }, 404);
        }

        const knownPort = resolveKnownPort(port);
        const row = (await portRepo.findOneBy({ deviceId: id, port })) ?? portRepo.create({
            deviceId: id,
            port,
            label: knownPort?.label ?? `TCP ${port}`,
            monitorEnabled: false,
            lastStatus: 'unknown',
            lastScannedAt: null,
        });

        row.label = knownPort?.label ?? row.label;
        row.monitorEnabled = body.monitorEnabled;
        await portRepo.save(row);

        const ports = await getDevicePorts(id);
        return c.json({ success: true, ports });
    });

    app.get('/api/devices/:id/history', async (c) => {
        const id = Number(c.req.param('id'));
        const period = c.req.query('period') ?? '24h';
        const fromDate = getPeriodStartDate(period);
        const now = new Date();

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid device id' }, 400);
        }

        const deviceRepo = dataSource.getRepository(Device);
        const historyRepo = dataSource.getRepository(DevicePingHistory);
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

            events = events.filter((event) => {
                const checkedAt = toValidDate(event.checkedAt);
                return checkedAt !== null && checkedAt >= fromDate && checkedAt <= now;
            });

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
            history: events
                .map((item) => {
                    const checkedAt = toValidDate(item.checkedAt);
                    if (!checkedAt) {
                        return null;
                    }

                    return {
                        status: item.status,
                        checkedAt: checkedAt.toISOString(),
                    };
                })
                .filter((item): item is { status: 'online' | 'offline'; checkedAt: string } => item !== null),
            slices,
        });
    });

    app.patch('/api/devices/:id', async (c) => {
        const id = Number(c.req.param('id'));
        const body = await c.req.json<{
            monitorPing?: boolean;
            assignedBotIds?: number[];
        }>();

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid device id' }, 400);
        }

        const deviceRepo = dataSource.getRepository(Device);
        const mappingRepo = dataSource.getRepository(DeviceNotification);

        const existing = await deviceRepo.findOneBy({ id });
        if (!existing) {
            return c.json({ success: false, error: 'Device not found' }, 404);
        }

        if (typeof body.monitorPing === 'boolean') {
            existing.monitorPing = body.monitorPing;
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
}
