import { api } from "$lib/api/client";
import type {
    Bot,
    Chat,
    Device,
    DevicePortsResponse,
    ScanDevicePortsResponse,
    LogsResponse,
    NetboxSettings,
} from "$lib/api/types";

export type DeviceUpdatePatch = Partial<
    Pick<Device, "monitorPing" | "monitorModbus" | "assignedBotIds">
>;

export async function fetchAppData() {
    const [devicesResponse, botsResponse, chatsResponse, settingsResponse, logsResponse] =
        await Promise.all([
            api<{ devices: Device[] }>("/api/devices"),
            api<{ bots: Bot[] }>("/api/bots"),
            api<{ chats: Chat[] }>("/api/chats"),
            api<NetboxSettings>("/api/settings/netbox"),
            api<LogsResponse>("/api/logs?limit=100&app_limit=100"),
        ]);

    return {
        devices: devicesResponse.devices,
        bots: botsResponse.bots,
        chats: chatsResponse.chats,
        settings: settingsResponse,
        logs: logsResponse.logs,
        appLogs: logsResponse.app_logs,
    };
}

export async function updateNetboxSettings(settings: NetboxSettings) {
    const response = await api<{
        success: boolean;
        settings: NetboxSettings;
    }>("/api/settings/netbox", {
        method: "PUT",
        body: JSON.stringify(settings),
    });

    return response.settings;
}

export async function syncNetbox() {
    return api<{
        success: boolean;
        synced: number;
        total: number;
    }>("/api/netbox/sync", {
        method: "POST",
    });
}

export async function updateDevice(deviceId: number, patch: DeviceUpdatePatch) {
    const response = await api<{ success: boolean; device: Device }>(
        `/api/devices/${deviceId}`,
        {
            method: "PATCH",
            body: JSON.stringify(patch),
        },
    );

    return response.device;
}

export async function fetchDevicePorts(deviceId: number) {
    return api<DevicePortsResponse>(`/api/devices/${deviceId}/ports`);
}

export async function scanDevicePorts(deviceId: number) {
    return api<ScanDevicePortsResponse>(`/api/devices/${deviceId}/ports/scan`, {
        method: "POST",
    });
}

export async function scanCustomDevicePort(deviceId: number, port: number) {
    return api<ScanDevicePortsResponse>(
        `/api/devices/${deviceId}/ports/scan-custom`,
        {
            method: "POST",
            body: JSON.stringify({ port }),
        },
    );
}

export async function updateDevicePortMonitor(
    deviceId: number,
    port: number,
    monitorEnabled: boolean,
) {
    return api<DevicePortsResponse>(`/api/devices/${deviceId}/ports/${port}`, {
        method: "PATCH",
        body: JSON.stringify({ monitorEnabled }),
    });
}

export async function deleteDevicePort(deviceId: number, port: number) {
    return api<DevicePortsResponse>(`/api/devices/${deviceId}/ports/${port}`, {
        method: "DELETE",
    });
}

export async function createBot(name: string, token: string) {
    return api<{ success: boolean; id: number }>("/api/bots", {
        method: "POST",
        body: JSON.stringify({ name, token }),
    });
}

export async function deleteBot(botId: number) {
    return api<{ success: boolean }>(`/api/bots/${botId}`, {
        method: "DELETE",
    });
}

export async function createChat(chatId: string, name: string) {
    return api<{ success: boolean; chat: Chat }>("/api/chats", {
        method: "POST",
        body: JSON.stringify({ chatId, name }),
    });
}

export async function deleteChat(chatId: number) {
    return api<{ success: boolean }>(`/api/chats/${chatId}`, {
        method: "DELETE",
    });
}

export async function fetchBotChatAssignments(botId: number) {
    return api<{
        bot: { id: number; name: string };
        chats: Array<Chat & { assigned: boolean }>;
    }>(`/api/bots/${botId}/chats`);
}

export async function setBotChatAssignment(
    botId: number,
    chatId: number,
    assigned: boolean,
) {
    return api<{ success: boolean }>(`/api/bots/${botId}/chats/${chatId}`, {
        method: "PATCH",
        body: JSON.stringify({ assigned }),
    });
}
