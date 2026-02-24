import type { Hono } from 'hono';
import { dataSource } from '../db/data-source';
import { Device, DeviceNotification, DevicePingHistory } from '../db/entities';
import { getDevices } from '../services/devices';
import { buildPingAvailabilitySlices, getPeriodStartDate, toValidDate } from '../services/history';

export function registerDevicesRoutes(app: Hono) {
    app.get('/api/devices', async (c) => c.json({ devices: await getDevices() }));

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
}
