import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

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

        queueMicrotask(() => {
            emitter.emit('close', 1);
        });

        return emitter;
    },
}));

vi.mock('../../src/services/telegram', () => ({
    queueAlert: vi.fn(async () => {
        throw new Error('queue-alert-failed');
    }),
    runTelegramWorker: vi.fn(async () => undefined),
}));

describe('monitor alert transactions', () => {
    const testDbPath = join(process.cwd(), 'data', 'monitor-transaction.test.db');

    let dataSource: (typeof import('../../src/db/data-source'))['dataSource'];
    let runMonitorCycle: (typeof import('../../src/services/monitor'))['runMonitorCycle'];
    let Device: (typeof import('../../src/db/entities'))['Device'];
    let DeviceAlertState: (typeof import('../../src/db/entities'))['DeviceAlertState'];
    let setTimeoutSpy: { mockRestore: () => void } | null = null;

    beforeAll(async () => {
        process.env.NOTIFY_GUARD_DB_PATH = testDbPath;

        const dataSourceModule = await import('../../src/db/data-source');
        const entitiesModule = await import('../../src/db/entities');
        const monitorModule = await import('../../src/services/monitor');

        dataSource = dataSourceModule.dataSource;
        runMonitorCycle = monitorModule.runMonitorCycle;
        Device = entitiesModule.Device;
        DeviceAlertState = entitiesModule.DeviceAlertState;

        if (!dataSource.isInitialized) {
            await dataSource.initialize();
        }
    });

    beforeEach(async () => {
        await dataSource.synchronize(true);

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

    it('does not persist pingDownSent when queueAlert fails inside transaction', async () => {
        const deviceRepo = dataSource.getRepository(Device);
        const alertStateRepo = dataSource.getRepository(DeviceAlertState);

        await deviceRepo.save(deviceRepo.create({
            id: 501,
            name: 'Tx Device',
            ip: '10.0.0.11',
            hasModbusTag: false,
            monitorPing: true,
            lastPingStatus: 'unknown',
            lastSeenAt: null,
        }));

        await expect(runMonitorCycle()).rejects.toThrow('queue-alert-failed');

        const alertState = await alertStateRepo.findOneBy({ deviceId: 501 });
        expect(alertState?.pingDownSent ?? false).toBe(false);
    });
});
