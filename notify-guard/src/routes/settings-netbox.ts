import type { Hono } from 'hono';
import { In } from 'typeorm';
import { dataSource } from '../db/data-source';
import { Device, DeviceAlertState, DeviceNotification, DevicePingHistory } from '../db/entities';
import { buildErrorDetails, writeAppLog } from '../lib/app-logger';
import { fetchNetboxIpAddresses, removeSubnetMask } from '../services/netbox';
import { getNetboxSettings, upsertSetting, type NetboxSettings } from '../services/settings';

export function registerSettingsNetboxRoutes(app: Hono) {
    app.get('/api/settings/netbox', async (c) => c.json(await getNetboxSettings()));

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

            const deviceRepo = dataSource.getRepository(Device);
            const mappingRepo = dataSource.getRepository(DeviceNotification);
            const pingHistoryRepo = dataSource.getRepository(DevicePingHistory);
            const alertStateRepo = dataSource.getRepository(DeviceAlertState);
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
            const staleDeviceIds = existingDevices.map((device) => device.id).filter((id) => !syncedIds.has(id));

            if (staleDeviceIds.length > 0) {
                await mappingRepo.delete({ deviceId: In(staleDeviceIds) });
                await pingHistoryRepo.delete({ deviceId: In(staleDeviceIds) });
                await alertStateRepo.delete({ deviceId: In(staleDeviceIds) });
                await deviceRepo.delete({ id: In(staleDeviceIds) });
            }

            return c.json({
                success: true,
                synced,
                total: ipAddresses.length,
                removed: staleDeviceIds.length,
            });
        } catch (error) {
            await writeAppLog({
                level: 'error',
                scope: 'netbox',
                message: 'NetBox sync failed',
                details: buildErrorDetails(error),
                path: c.req.path,
                method: c.req.method,
                status: 500,
            });

            const message = error instanceof Error ? error.message : String(error);
            return c.json({ success: false, error: message }, 500);
        }
    });
}
