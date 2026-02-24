import type { DevicePingHistory } from '../db/entities';

export type PingAvailabilitySlice = {
    status: 'online' | 'offline';
    startedAt: string;
    endedAt: string | null;
};

export function getPeriodStartDate(period: string): Date | null {
    const normalized = period.toLowerCase();
    const now = Date.now();

    if (normalized === 'all') {
        return null;
    }

    if (normalized === '24h') {
        return new Date(now - 24 * 60 * 60 * 1000);
    }

    if (normalized === '7d') {
        return new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    if (normalized === '30d') {
        return new Date(now - 30 * 24 * 60 * 60 * 1000);
    }

    return new Date(now - 24 * 60 * 60 * 1000);
}

export function buildPingAvailabilitySlices(
    events: DevicePingHistory[],
    fromDate: Date | null,
    now: Date,
): PingAvailabilitySlice[] {
    if (events.length === 0) {
        return [];
    }

    const slices: PingAvailabilitySlice[] = [];

    for (const [index, current] of events.entries()) {
        const currentCheckedAt = toValidDate(current.checkedAt);
        if (!currentCheckedAt) {
            continue;
        }

        const next = events[index + 1] ?? null;
        const nextCheckedAt = next ? toValidDate(next.checkedAt) : null;

        const start = fromDate && currentCheckedAt < fromDate
            ? fromDate
            : currentCheckedAt;

        const end = nextCheckedAt
            ? nextCheckedAt
            : (fromDate ? now : null);

        if (fromDate && end && end <= fromDate) {
            continue;
        }

        if (end && end <= start) {
            continue;
        }

        slices.push({
            status: current.status,
            startedAt: start.toISOString(),
            endedAt: end ? end.toISOString() : null,
        });
    }

    return slices;
}

export function toValidDate(value: Date | string | null | undefined): Date | null {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}
