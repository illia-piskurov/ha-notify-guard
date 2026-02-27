import type { Hono } from 'hono';
import { dataSource } from '../db/data-source';
import { Device, DeviceNotification, DevicePingHistory, DevicePortMonitor } from '../db/entities';
import { getDevices } from '../services/devices';
import { getDevicePorts, knownScanPorts, probeTcpPort, resolveKnownPort } from '../services/device-ports';
import { buildPingAvailabilitySlices, getPeriodStartDate, toValidDate } from '../services/history';

export function registerDevicesRoutes(app: Hono) {
    app.get('/api/devices', async (c) => c.json({ devices: await getDevices() }));

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

        if (port === 502) {
            device.monitorModbus = body.monitorEnabled;
            await deviceRepo.save(device);
        }

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
            monitorModbus?: boolean;
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

        if (typeof body.monitorModbus === 'boolean') {
            existing.monitorModbus = body.monitorModbus;

            const portRepo = dataSource.getRepository(DevicePortMonitor);
            const modbusPort = await portRepo.findOneBy({ deviceId: id, port: 502 });
            if (modbusPort) {
                modbusPort.monitorEnabled = body.monitorModbus;
                await portRepo.save(modbusPort);
            }
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
