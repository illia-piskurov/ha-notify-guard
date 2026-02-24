import { dataSource } from '../db/data-source';
import { Device, DeviceNotification } from '../db/entities';

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
