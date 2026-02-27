export type Device = {
    id: number;
    name: string;
    ip: string;
    hasModbusTag: boolean;
    monitorPing: boolean;
    monitorModbus: boolean;
    lastPingStatus: string;
    lastModbusStatus: string;
    lastSeenAt: string | null;
    assignedBotIds: number[];
    portStatuses: Array<{
        port: number;
        label: string;
        status: "open" | "closed";
    }>;
};

export type DevicePort = {
    deviceId: number;
    port: number;
    label: string;
    monitorEnabled: boolean;
    lastStatus: string;
    lastScannedAt: string | null;
};

export type DevicePortsResponse = {
    success: boolean;
    ports: DevicePort[];
};

export type ScanOpenPort = {
    port: number;
    label: string;
    status: "open" | "closed";
};

export type ScanDevicePortsResponse = {
    success: boolean;
    scannedAt: string;
    openPorts: ScanOpenPort[];
    ports: DevicePort[];
};

export type Bot = {
    id: number;
    name: string;
    chatCount: number;
    activeChatCount: number;
};

export type BotChat = {
    id: number;
    chatId: string;
    isActive: boolean;
};

export type NetboxSettings = {
    netbox_url: string;
    netbox_token: string;
    poll_seconds: number;
};

export type DeviceHistorySlice = {
    status: 'online' | 'offline';
    startedAt: string;
    endedAt: string | null;
};

export type HistoryPeriod = '24h' | '7d' | '30d' | 'all';

export type NotificationLogEntry = {
    id: number;
    message: string;
    idempotency_key: string | null;
    source: string;
    status: string;
    attempts: number;
    last_error: string | null;
    next_attempt_at: string | null;
    created_at: string | null;
    sent_at: string | null;
};

export type AppLogEntry = {
    id: number;
    level: string;
    scope: string;
    message: string;
    details: string | null;
    path: string | null;
    method: string | null;
    status: number | null;
    created_at: string | null;
};

export type LogsResponse = {
    logs: NotificationLogEntry[];
    app_logs: AppLogEntry[];
};
