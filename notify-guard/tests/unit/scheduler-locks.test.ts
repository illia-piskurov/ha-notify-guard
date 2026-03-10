import { afterEach, describe, expect, it, vi } from 'vitest';

const monitorCycleMock = vi.fn(async () => undefined);
const telegramWorkerMock = vi.fn(async () => undefined);

vi.mock('../../src/services/monitor', () => ({
    runMonitorCycle: monitorCycleMock,
}));

vi.mock('../../src/services/telegram', () => ({
    runTelegramWorker: telegramWorkerMock,
}));

describe('background worker scheduler locks', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        monitorCycleMock.mockClear();
        telegramWorkerMock.mockClear();
    });

    it('does not overlap telegram worker runs while previous run is pending', async () => {
        vi.useFakeTimers();

        let releaseFirstRun: () => void = () => undefined;
        const firstRunPromise = new Promise<void>((resolve) => {
            releaseFirstRun = () => {
                resolve();
            };
        });

        telegramWorkerMock
            .mockImplementationOnce(async () => {
                await firstRunPromise;
            })
            .mockImplementation(async () => undefined);

        const { startBackgroundWorkers } = await import('../../src/workers/scheduler');
        startBackgroundWorkers();

        await vi.advanceTimersByTimeAsync(5_000);
        expect(telegramWorkerMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(5_000);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(telegramWorkerMock).toHaveBeenCalledTimes(1);

        releaseFirstRun();
        await Promise.resolve();

        await vi.advanceTimersByTimeAsync(5_000);
        expect(telegramWorkerMock).toHaveBeenCalledTimes(2);
    });

    it('does not overlap monitor cycle runs while previous run is pending', async () => {
        vi.useFakeTimers();

        let releaseFirstMonitorRun: () => void = () => undefined;
        const firstMonitorRunPromise = new Promise<void>((resolve) => {
            releaseFirstMonitorRun = () => {
                resolve();
            };
        });

        monitorCycleMock
            .mockImplementationOnce(async () => {
                await firstMonitorRunPromise;
            })
            .mockImplementation(async () => undefined);

        const { startBackgroundWorkers } = await import('../../src/workers/scheduler');
        startBackgroundWorkers();

        await vi.advanceTimersByTimeAsync(30_000);
        expect(monitorCycleMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(30_000);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(monitorCycleMock).toHaveBeenCalledTimes(1);

        releaseFirstMonitorRun();
        await Promise.resolve();

        await vi.advanceTimersByTimeAsync(30_000);
        expect(monitorCycleMock).toHaveBeenCalledTimes(2);
    });
});
