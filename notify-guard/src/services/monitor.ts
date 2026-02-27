import { Socket } from 'node:net';
import { spawn } from 'node:child_process';
import { dataSource } from '../db/data-source';
import { Device, DeviceAlertState, DevicePingHistory, DevicePortAlertState, DevicePortMonitor } from '../db/entities';
import { queueAlert } from './telegram';

const RETRY_DELAYS_MS = [5_000, 10_000, 15_000] as const;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMonitorCycle() {
    const deviceRepo = dataSource.getRepository(Device);
    const portRepo = dataSource.getRepository(DevicePortMonitor);
    const alertStateRepo = dataSource.getRepository(DeviceAlertState);
    const portAlertStateRepo = dataSource.getRepository(DevicePortAlertState);
    const devices = await deviceRepo.find();

    for (const device of devices) {
        const monitoredPorts = await portRepo.find({
            where: {
                deviceId: device.id,
                monitorEnabled: true,
            },
        });

        const pingEnabled = device.monitorPing;
        const modbusEnabled = monitoredPorts.some((item) => item.port === 502) || device.monitorModbus;

        if (!pingEnabled && !modbusEnabled && monitoredPorts.length === 0) {
            continue;
        }

        const currentPingStatus = pingEnabled
            ? await probePingWithRetry(device.ip)
            : 'disabled';
        const currentModbusStatus = modbusEnabled
            ? await probeModbusWithRetry(device.ip)
            : 'disabled';

        if (currentPingStatus === 'online' || currentPingStatus === 'offline') {
            await recordPingHistoryIfChanged(device.id, currentPingStatus);
        }

        const now = new Date();
        const monitoredPortSet = new Set<number>();

        for (const portMonitor of monitoredPorts) {
            monitoredPortSet.add(portMonitor.port);

            const portStatus = portMonitor.port === 502
                ? currentModbusStatus
                : await probePortWithRetry(device.ip, portMonitor.port);

            portMonitor.lastStatus = portStatus;
            portMonitor.lastScannedAt = now;
            await portRepo.save(portMonitor);

            let portAlertState = await portAlertStateRepo.findOneBy({
                deviceId: device.id,
                port: portMonitor.port,
            });

            if (!portAlertState) {
                portAlertState = portAlertStateRepo.create({
                    deviceId: device.id,
                    port: portMonitor.port,
                    downSent: false,
                });
            }

            if (portStatus === 'closed' && !portAlertState.downSent) {
                await queueAlert(
                    device,
                    `⚠️ Port fail: ${device.name} (${device.ip}) ${portMonitor.label} TCP/${portMonitor.port} is closed`,
                );
                portAlertState.downSent = true;
                await portAlertStateRepo.save(portAlertState);
            }

            if (portStatus === 'open' && portAlertState.downSent) {
                portAlertState.downSent = false;
                await portAlertStateRepo.save(portAlertState);
            }
        }

        const stalePortAlertStates = await portAlertStateRepo.findBy({ deviceId: device.id });
        for (const state of stalePortAlertStates) {
            if (!monitoredPortSet.has(state.port) && state.downSent) {
                state.downSent = false;
                await portAlertStateRepo.save(state);
            }
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

        if ((!modbusEnabled || currentModbusStatus === 'open') && alertState.modbusDownSent) {
            alertState.modbusDownSent = false;
            alertStateChanged = true;
        }

        if (alertStateChanged) {
            await alertStateRepo.save(alertState);
        }

        device.lastPingStatus = currentPingStatus;
        device.lastModbusStatus = currentModbusStatus;
        device.monitorModbus = modbusEnabled;
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
        ? ['-n', '1', '-w', '1000', ip]
        : ['-c', '1', '-W', '1', ip];

    return new Promise((resolve) => {
        const proc = spawn('ping', args, {
            stdio: 'ignore',
        });

        proc.on('close', (code) => {
            resolve(code === 0 ? 'online' : 'offline');
        });

        proc.on('error', () => {
            resolve('offline');
        });
    });
}

async function probePingWithRetry(ip: string): Promise<'online' | 'offline'> {
    const firstAttempt = await probePing(ip);
    if (firstAttempt === 'online') {
        return 'online';
    }

    for (const delayMs of RETRY_DELAYS_MS) {
        await sleep(delayMs);
        const retryStatus = await probePing(ip);
        if (retryStatus === 'online') {
            return 'online';
        }
    }

    return 'offline';
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

async function probeModbusWithRetry(ip: string): Promise<'open' | 'closed'> {
    const firstAttempt = await probeModbus(ip);
    if (firstAttempt === 'open') {
        return 'open';
    }

    for (const delayMs of RETRY_DELAYS_MS) {
        await sleep(delayMs);
        const retryStatus = await probeModbus(ip);
        if (retryStatus === 'open') {
            return 'open';
        }
    }

    return 'closed';
}

async function probePort(ip: string, port: number): Promise<'open' | 'closed'> {
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

        socket.connect(port, ip);
    });
}

async function probePortWithRetry(ip: string, port: number): Promise<'open' | 'closed'> {
    const firstAttempt = await probePort(ip, port);
    if (firstAttempt === 'open') {
        return 'open';
    }

    for (const delayMs of RETRY_DELAYS_MS) {
        await sleep(delayMs);
        const retryStatus = await probePort(ip, port);
        if (retryStatus === 'open') {
            return 'open';
        }
    }

    return 'closed';
}
