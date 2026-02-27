import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const portStates = new Map<number, 'open' | 'closed'>();

vi.mock('node:net', () => {
    class MockSocket extends EventEmitter {
        setTimeout(_ms: number) {
            return this;
        }

        connect(port: number, _ip: string) {
            const state = portStates.get(port) ?? 'closed';
            setTimeout(() => {
                this.emit(state === 'open' ? 'connect' : 'timeout');
            }, 0);
            return this;
        }

        destroy() {
            return this;
        }
    }

    return {
        Socket: MockSocket,
    };
});

vi.mock('node:child_process', () => ({
    spawn: () => {
        const emitter = new EventEmitter() as EventEmitter & {
            on: (event: 'close' | 'error', listener: (...args: unknown[]) => void) => typeof emitter;
        };

        setTimeout(() => {
            emitter.emit('close', 1);
        }, 0);

        return emitter;
    },
}));

vi.mock('../../src/services/telegram', () => ({
    queueAlert: vi.fn(async () => undefined),
    runTelegramWorker: vi.fn(async () => undefined),
}));

describe('monitor cycle port alerts', () => {
    const testDbPath = join(process.cwd(), 'data', 'monitor-alerts.test.db');

    let dataSource: (typeof import('../../src/db/data-source'))['dataSource'];
    let runMonitorCycle: (typeof import('../../src/services/monitor'))['runMonitorCycle'];
    let Device: (typeof import('../../src/db/entities'))['Device'];
    let DevicePortMonitor: (typeof import('../../src/db/entities'))['DevicePortMonitor'];
    let queueAlertMock: ReturnType<typeof vi.fn>;
    let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

    beforeAll(async () => {
        process.env.NOTIFY_GUARD_DB_PATH = testDbPath;

        const dataSourceModule = await import('../../src/db/data-source');
        const entitiesModule = await import('../../src/db/entities');
        const monitorModule = await import('../../src/services/monitor');
        const telegramModule = await import('../../src/services/telegram');

        dataSource = dataSourceModule.dataSource;
        runMonitorCycle = monitorModule.runMonitorCycle;
        Device = entitiesModule.Device;
        DevicePortMonitor = entitiesModule.DevicePortMonitor;
        queueAlertMock = telegramModule.queueAlert as unknown as ReturnType<typeof vi.fn>;

        if (!dataSource.isInitialized) {
            await dataSource.initialize();
        }
    });

    beforeEach(async () => {
        await dataSource.synchronize(true);
        queueAlertMock.mockClear();
        portStates.clear();

        setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: TimerHandler, _delay?: number, ...args: unknown[]) => {
            if (typeof callback === 'function') {
                (callback as (...input: unknown[]) => void)(...args);
            }

            return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout);
    });

    afterEach(() => {
        setTimeoutSpy.mockRestore();
    });

    afterAll(async () => {
        if (dataSource.isInitialized) {
            await dataSource.destroy();
        }

        if (existsSync(testDbPath)) {
            unlinkSync(testDbPath);
        }
    });

    it('sends one alert while port stays closed and does not duplicate', async () => {
        await seedDeviceWithMonitoredPort({ deviceId: 301, port: 2163, label: 'TCP 2163' });
        portStates.set(2163, 'closed');

        await runCycleWithTimers(runMonitorCycle);
        expect(queueAlertMock).toHaveBeenCalledTimes(1);
        expect(String(queueAlertMock.mock.calls[0]?.[1] ?? '')).toContain('TCP/2163');

        await runCycleWithTimers(runMonitorCycle);
        expect(queueAlertMock).toHaveBeenCalledTimes(1);
    });

    it('sends alert again after recovery and next failure', async () => {
        await seedDeviceWithMonitoredPort({ deviceId: 302, port: 1883, label: 'MQTT' });

        portStates.set(1883, 'closed');
        await runCycleWithTimers(runMonitorCycle);
        expect(queueAlertMock).toHaveBeenCalledTimes(1);

        portStates.set(1883, 'open');
        await runCycleWithTimers(runMonitorCycle);
        expect(queueAlertMock).toHaveBeenCalledTimes(1);

        portStates.set(1883, 'closed');
        await runCycleWithTimers(runMonitorCycle);
        expect(queueAlertMock).toHaveBeenCalledTimes(2);
    });

    async function runCycleWithTimers(runCycle: () => Promise<void>) {
        const cyclePromise = runCycle();
        await Promise.resolve();
        await cyclePromise;
    }

    async function seedDeviceWithMonitoredPort(input: {
        deviceId: number;
        port: number;
        label: string;
    }) {
        const deviceRepo = dataSource.getRepository(Device);
        const portRepo = dataSource.getRepository(DevicePortMonitor);

        await deviceRepo.save(deviceRepo.create({
            id: input.deviceId,
            name: `Device ${input.deviceId}`,
            ip: '10.0.0.10',
            hasModbusTag: false,
            monitorPing: false,
            monitorModbus: false,
            lastPingStatus: 'unknown',
            lastModbusStatus: 'unknown',
            lastSeenAt: null,
        }));

        await portRepo.save(portRepo.create({
            deviceId: input.deviceId,
            port: input.port,
            label: input.label,
            monitorEnabled: true,
            lastStatus: 'unknown',
            lastScannedAt: null,
        }));
    }
});
