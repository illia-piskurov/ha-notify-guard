import { Socket } from 'node:net';
import { dataSource } from '../db/data-source';
import { DevicePortMonitor } from '../db/entities';

export type KnownPort = {
    port: number;
    label: string;
};

export const KNOWN_PORTS: KnownPort[] = [
    { port: 21, label: 'FTP' },
    { port: 22, label: 'SFTP/SSH' },
    { port: 80, label: 'HTTP' },
    { port: 443, label: 'HTTPS' },
    { port: 502, label: 'Modbus TCP' },
    { port: 1883, label: 'MQTT' },
    { port: 8883, label: 'MQTTS' },
    { port: 3671, label: 'KNX/IP' },
];

export type PortScanStatus = 'open' | 'closed';

export type DevicePortView = {
    deviceId: number;
    port: number;
    label: string;
    monitorEnabled: boolean;
    lastStatus: string;
    lastScannedAt: string | null;
};

function toIso(value: Date | string | null): string | null {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return value;
}

function toView(row: DevicePortMonitor): DevicePortView {
    return {
        deviceId: row.deviceId,
        port: row.port,
        label: row.label,
        monitorEnabled: row.monitorEnabled,
        lastStatus: row.lastStatus,
        lastScannedAt: toIso(row.lastScannedAt),
    };
}

export async function ensureDevicePortRows(deviceIds: number[]) {
    if (deviceIds.length === 0) {
        return;
    }

    const repo = dataSource.getRepository(DevicePortMonitor);

    for (const deviceId of deviceIds) {
        for (const knownPort of KNOWN_PORTS) {
            const existing = await repo.findOneBy({ deviceId, port: knownPort.port });
            if (existing) {
                continue;
            }

            await repo.save(repo.create({
                deviceId,
                port: knownPort.port,
                label: knownPort.label,
                monitorEnabled: false,
                lastStatus: 'unknown',
                lastScannedAt: null,
            }));
        }
    }
}

export async function getDevicePorts(deviceId: number): Promise<DevicePortView[]> {
    const repo = dataSource.getRepository(DevicePortMonitor);
    const rows = await repo.find({
        where: { deviceId },
        order: { port: 'ASC' },
    });

    return rows.map(toView);
}

export function resolveKnownPort(port: number): KnownPort | null {
    const value = KNOWN_PORTS.find((item) => item.port === port);
    return value ?? null;
}

export function knownScanPorts(): number[] {
    return KNOWN_PORTS.map((item) => item.port);
}

export async function probeTcpPort(ip: string, port: number): Promise<PortScanStatus> {
    return new Promise((resolve) => {
        const socket = new Socket();

        const finish = (status: PortScanStatus) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(status);
        };

        socket.setTimeout(900);
        socket.once('connect', () => finish('open'));
        socket.once('timeout', () => finish('closed'));
        socket.once('error', () => finish('closed'));

        socket.connect(port, ip);
    });
}
