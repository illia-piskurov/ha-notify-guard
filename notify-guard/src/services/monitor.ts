import { Socket } from 'node:net';
import { dataSource } from '../db/data-source';
import { Device, DeviceAlertState, DevicePingHistory } from '../db/entities';
import { queueAlert } from './telegram';

export async function runMonitorCycle() {
    const deviceRepo = dataSource.getRepository(Device);
    const alertStateRepo = dataSource.getRepository(DeviceAlertState);
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

        let alertState = await alertStateRepo.findOneBy({ deviceId: device.id });
        if (!alertState) {
            alertState = alertStateRepo.create({
                deviceId: device.id,
                pingDownSent: false,
                modbusDownSent: false,
            });
        }

        let alertStateChanged = false;

        if (pingEnabled && currentPingStatus === 'offline' && !alertState.pingDownSent) {
            await queueAlert(device, `🚨 Ping fail: ${device.name} (${device.ip}) is unreachable`);
            alertState.pingDownSent = true;
            alertStateChanged = true;
        }

        if ((!pingEnabled || currentPingStatus === 'online') && alertState.pingDownSent) {
            alertState.pingDownSent = false;
            alertStateChanged = true;
        }

        if (modbusEnabled && currentModbusStatus === 'closed' && !alertState.modbusDownSent) {
            await queueAlert(device, `⚠️ Modbus fail: ${device.name} (${device.ip}) TCP/502 is closed`);
            alertState.modbusDownSent = true;
            alertStateChanged = true;
        }

        if ((!modbusEnabled || currentModbusStatus === 'open') && alertState.modbusDownSent) {
            alertState.modbusDownSent = false;
            alertStateChanged = true;
        }

        if (alertStateChanged) {
            await alertStateRepo.save(alertState);
        }

        device.lastPingStatus = currentPingStatus;
        device.lastModbusStatus = currentModbusStatus;
        device.lastSeenAt = new Date();

        await deviceRepo.save(device);
    }
}

async function recordPingHistoryIfChanged(deviceId: number, status: 'online' | 'offline') {
    const historyRepo = dataSource.getRepository(DevicePingHistory);
    const last = await historyRepo.findOne({
        where: { deviceId },
        order: { checkedAt: 'DESC' },
    });

    if (last?.status === status) {
        return;
    }

    await historyRepo.save(historyRepo.create({ deviceId, status }));
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
