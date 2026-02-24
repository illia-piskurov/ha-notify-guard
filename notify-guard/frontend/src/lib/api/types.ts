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
