import { dataSource } from '../db/data-source';
import { AppLog } from '../db/entities';

export type AppLogEntry = {
    level: 'info' | 'warn' | 'error';
    scope: string;
    message: string;
    details?: string | null;
    path?: string | null;
    method?: string | null;
    status?: number | null;
};

export function buildErrorDetails(error: unknown): string {
    if (error instanceof Error) {
        return truncateLogText(error.stack ?? error.message);
    }

    return truncateLogText(String(error));
}

function truncateLogText(value: string, maxLength = 4000): string {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength)}...(truncated)`;
}

export async function writeAppLog(entry: AppLogEntry) {
    try {
        if (!dataSource.isInitialized) {
            return;
        }

        const appLogRepo = dataSource.getRepository(AppLog);
        await appLogRepo.save(appLogRepo.create({
            level: entry.level,
            scope: entry.scope,
            message: truncateLogText(entry.message, 512),
            details: entry.details ? truncateLogText(entry.details) : null,
            path: entry.path ?? null,
            method: entry.method ?? null,
            status: entry.status ?? null,
        }));
    } catch (logError) {
        console.error('failed to write app log:', logError);
    }
}
