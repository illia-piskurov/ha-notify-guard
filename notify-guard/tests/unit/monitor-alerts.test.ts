import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const queueAlertCalls: unknown[][] = [];

const portStates = new Map<number, 'open' | 'closed'>();

vi.mock('node:net', () => {
    class MockSocket {
        private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

        once(event: string, listener: (...args: unknown[]) => void) {
            const wrapped = (...args: unknown[]) => {
                this.off(event, wrapped);
                listener(...args);
            };
            this.on(event, wrapped);
            return this;
        }

        on(event: string, listener: (...args: unknown[]) => void) {
            const group = this.listeners.get(event) ?? [];
            group.push(listener);
            this.listeners.set(event, group);
            return this;
        }

        off(event: string, listener: (...args: unknown[]) => void) {
            const group = this.listeners.get(event) ?? [];
            this.listeners.set(event, group.filter((item) => item !== listener));
            return this;
        }

        emit(event: string, ...args: unknown[]) {
            const group = this.listeners.get(event) ?? [];
            for (const listener of group) {
                listener(...args);
            }
            return this;
        }

        removeAllListeners() {
            this.listeners.clear();
            return this;
        }

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
        const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

        const emitter = {
            on(event: 'close' | 'error', listener: (...args: unknown[]) => void) {
                const group = listeners.get(event) ?? [];
                group.push(listener);
                listeners.set(event, group);
                return emitter;
            },
            emit(event: 'close' | 'error', ...args: unknown[]) {
                const group = listeners.get(event) ?? [];
                for (const listener of group) {
                    listener(...args);
                }
            },
        };

        setTimeout(() => {
            emitter.emit('close', 1);
        }, 0);

        return emitter;
    },
}));

vi.mock('../../src/services/telegram', () => ({
    queueAlert: async (...args: unknown[]) => {
        queueAlertCalls.push(args);
    },
    runTelegramWorker: async () => undefined,
}));

describe('monitor cycle port alerts', () => {
    const testDbPath = join(process.cwd(), 'data', 'monitor-alerts.test.db');

    let dataSource: (typeof import('../../src/db/data-source'))['dataSource'];
    let runMonitorCycle: (typeof import('../../src/services/monitor'))['runMonitorCycle'];
    let Device: (typeof import('../../src/db/entities'))['Device'];
    let DevicePortMonitor: (typeof import('../../src/db/entities'))['DevicePortMonitor'];
    let setTimeoutSpy: { mockRestore: () => void } | null = null;

    beforeAll(async () => {
        process.env.NOTIFY_GUARD_DB_PATH = testDbPath;

        const dataSourceModule = await import('../../src/db/data-source');
        const entitiesModule = await import('../../src/db/entities');
        const monitorModule = await import('../../src/services/monitor');
        dataSource = dataSourceModule.dataSource;
        runMonitorCycle = monitorModule.runMonitorCycle;
        Device = entitiesModule.Device;
        DevicePortMonitor = entitiesModule.DevicePortMonitor;

        if (!dataSource.isInitialized) {
            await dataSource.initialize();
        }
    });

    beforeEach(async () => {
        await dataSource.synchronize(true);
        queueAlertCalls.length = 0;
        portStates.clear();

        setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: Parameters<typeof setTimeout>[0], _delay?: number, ...args: unknown[]) => {
            if (typeof callback === 'function') {
                (callback as (...input: unknown[]) => void)(...args);
            }

            return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout);
    });

    afterEach(() => {
        setTimeoutSpy?.mockRestore();
        setTimeoutSpy = null;
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
        expect(queueAlertCalls.length).toBe(1);
        expect(String(queueAlertCalls[0]?.[1] ?? '')).toContain('TCP/2163');

        await runCycleWithTimers(runMonitorCycle);
        expect(queueAlertCalls.length).toBe(1);
    });

    it('sends alert again after recovery and next failure', async () => {
        await seedDeviceWithMonitoredPort({ deviceId: 302, port: 1883, label: 'MQTT' });

        portStates.set(1883, 'closed');
        await runCycleWithTimers(runMonitorCycle);
        expect(queueAlertCalls.length).toBe(1);

        portStates.set(1883, 'open');
        await runCycleWithTimers(runMonitorCycle);
        expect(queueAlertCalls.length).toBe(1);

        portStates.set(1883, 'closed');
        await runCycleWithTimers(runMonitorCycle);
        expect(queueAlertCalls.length).toBe(2);
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
            lastPingStatus: 'unknown',
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
