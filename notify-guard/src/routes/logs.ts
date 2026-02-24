import type { Hono } from 'hono';
import { dataSource } from '../db/data-source';
import { AppLog, Notification } from '../db/entities';

export function registerLogsRoutes(app: Hono) {
    app.get('/api/logs', async (c) => {
        const limitRaw = Number(c.req.query('limit') ?? 50);
        const limit = Number.isNaN(limitRaw) ? 50 : Math.min(Math.max(limitRaw, 1), 200);
        const appLimitRaw = Number(c.req.query('app_limit') ?? 50);
        const appLimit = Number.isNaN(appLimitRaw) ? 50 : Math.min(Math.max(appLimitRaw, 1), 200);

        const notificationRepo = dataSource.getRepository(Notification);
        const appLogRepo = dataSource.getRepository(AppLog);

        const rows = await notificationRepo.find({
            order: { id: 'DESC' },
            take: limit,
        });

        const appRows = await appLogRepo.find({
            order: { id: 'DESC' },
            take: appLimit,
        });

        return c.json({
            logs: rows.map((row) => ({
                id: row.id,
                message: row.message,
                status: row.status,
                attempts: row.attempts,
                last_error: row.lastError,
                next_attempt_at: toDateValue(row.nextAttemptAt),
                created_at: toDateValue(row.createdAt),
                sent_at: toDateValue(row.sentAt),
            })),
            app_logs: appRows.map((row) => ({
                id: row.id,
                level: row.level,
                scope: row.scope,
                message: row.message,
                details: row.details,
                path: row.path,
                method: row.method,
                status: row.status,
                created_at: toDateValue(row.createdAt),
            })),
        });
    });
}

function toDateValue(value: Date | string | null): string | null {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return value;
}
