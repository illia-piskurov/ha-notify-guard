import { dataSource } from '../db/data-source';
import { Device, DeviceNotification, DevicePortMonitor } from '../db/entities';

export type DevicePortStatusView = {
    port: number;
    label: string;
    status: 'open' | 'closed';
};

export type DeviceView = {
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
    portStatuses: DevicePortStatusView[];
};

function toDateValue(value: Date | string | null): string | null {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return value;
}

export async function getDevices(): Promise<DeviceView[]> {
    const deviceRepo = dataSource.getRepository(Device);
    const mappingRepo = dataSource.getRepository(DeviceNotification);
    const portRepo = dataSource.getRepository(DevicePortMonitor);

    const [devices, mappings, ports] = await Promise.all([
        deviceRepo.find({ order: { name: 'ASC' } }),
        mappingRepo.find(),
        portRepo.find({ order: { port: 'ASC' } }),
    ]);

    const map = new Map<number, number[]>();
    for (const mapping of mappings) {
        const list = map.get(mapping.deviceId) ?? [];
        list.push(mapping.botId);
        map.set(mapping.deviceId, list);
    }

    const portMap = new Map<number, DevicePortStatusView[]>();
    for (const item of ports) {
        if (!item.monitorEnabled) {
            continue;
        }

        if (item.lastStatus !== 'open' && item.lastStatus !== 'closed') {
            continue;
        }

        const list = portMap.get(item.deviceId) ?? [];
        list.push({
            port: item.port,
            label: item.label,
            status: item.lastStatus,
        });
        portMap.set(item.deviceId, list);
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
        portStatuses: portMap.get(device.id) ?? [],
    }));
}
