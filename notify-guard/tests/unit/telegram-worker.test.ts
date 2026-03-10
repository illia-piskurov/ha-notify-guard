import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

describe('telegram worker reliability', () => {
    const testDbPath = join(process.cwd(), 'data', 'telegram-worker.test.db');

    let dataSource: (typeof import('../../src/db/data-source'))['dataSource'];
    let runTelegramWorker: (typeof import('../../src/services/telegram'))['runTelegramWorker'];
    let Notification: (typeof import('../../src/db/entities'))['Notification'];

    const originalFetch = globalThis.fetch;

    beforeAll(async () => {
        process.env.NOTIFY_GUARD_DB_PATH = testDbPath;

        const dataSourceModule = await import('../../src/db/data-source');
        const entitiesModule = await import('../../src/db/entities');
        const telegramModule = await import('../../src/services/telegram');

        dataSource = dataSourceModule.dataSource;
        runTelegramWorker = telegramModule.runTelegramWorker;
        Notification = entitiesModule.Notification;

        if (!dataSource.isInitialized) {
            await dataSource.initialize();
        }
    });

    beforeEach(async () => {
        await dataSource.synchronize(true);
        globalThis.fetch = originalFetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    afterAll(async () => {
        if (dataSource.isInitialized) {
            await dataSource.destroy();
        }

        if (existsSync(testDbPath)) {
            unlinkSync(testDbPath);
        }
    });

    it('claims pending jobs and updates sent/failed states per response', async () => {
        const notificationRepo = dataSource.getRepository(Notification);

        await notificationRepo.save([
            notificationRepo.create({
                botId: 1,
                token: 'token-a',
                chatId: 'chat-ok',
                idempotencyKey: null,
                source: 'test',
                message: 'ok-message',
                status: 'pending',
                attempts: 0,
                processingToken: null,
                processingStartedAt: null,
                sentAt: null,
                lastError: null,
                nextAttemptAt: null,
            }),
            notificationRepo.create({
                botId: 1,
                token: 'token-b',
                chatId: 'chat-fail',
                idempotencyKey: null,
                source: 'test',
                message: 'fail-message',
                status: 'pending',
                attempts: 0,
                processingToken: null,
                processingStartedAt: null,
                sentAt: null,
                lastError: null,
                nextAttemptAt: null,
            }),
        ]);

        globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
            const rawBody = typeof init?.body === 'string' ? init.body : '{}';
            const parsed = JSON.parse(rawBody) as { chat_id?: string };

            if (parsed.chat_id === 'chat-ok') {
                return { ok: true, status: 200 } as Response;
            }

            return { ok: false, status: 500 } as Response;
        }) as typeof fetch;

        await runTelegramWorker();

        const rows = await notificationRepo.find({ order: { id: 'ASC' } });
        expect(rows.length).toBe(2);

        const sent = rows.find((item) => item.chatId === 'chat-ok');
        const failed = rows.find((item) => item.chatId === 'chat-fail');

        expect(sent?.status).toBe('sent');
        expect(sent?.attempts).toBe(1);
        expect(sent?.sentAt).not.toBeNull();
        expect(sent?.processingToken).toBeNull();
        expect(sent?.processingStartedAt).toBeNull();

        expect(failed?.status).toBe('failed');
        expect(failed?.attempts).toBe(1);
        expect(failed?.nextAttemptAt).not.toBeNull();
        expect(failed?.lastError).toContain('Telegram API 500');
        expect(failed?.processingToken).toBeNull();
        expect(failed?.processingStartedAt).toBeNull();
    });

    it('recovers stale processing job and retries it in same worker run', async () => {
        const notificationRepo = dataSource.getRepository(Notification);

        const staleStartedAt = new Date(Date.now() - 10 * 60_000);

        const seeded = await notificationRepo.save(notificationRepo.create({
            botId: 2,
            token: 'token-stale',
            chatId: 'chat-stale',
            idempotencyKey: null,
            source: 'test',
            message: 'stale-message',
            status: 'processing',
            attempts: 2,
            processingToken: 'old-processing-token',
            processingStartedAt: staleStartedAt,
            sentAt: null,
            lastError: null,
            nextAttemptAt: null,
        }));

        globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200 } as Response)) as typeof fetch;

        await runTelegramWorker();

        const updated = await notificationRepo.findOneByOrFail({ id: seeded.id });
        expect(updated.status).toBe('sent');
        expect(updated.attempts).toBe(3);
        expect(updated.sentAt).not.toBeNull();
        expect(updated.processingToken).toBeNull();
        expect(updated.processingStartedAt).toBeNull();
    });
});
