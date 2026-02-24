import { api } from "$lib/api/client";
import type {
    Bot,
    Device,
    LogsResponse,
    NetboxSettings,
} from "$lib/api/types";

export type DeviceUpdatePatch = Partial<
    Pick<Device, "monitorPing" | "monitorModbus" | "assignedBotIds">
>;

export async function fetchAppData() {
    const [devicesResponse, botsResponse, settingsResponse, logsResponse] =
        await Promise.all([
            api<{ devices: Device[] }>("/api/devices"),
            api<{ bots: Bot[] }>("/api/bots"),
            api<NetboxSettings>("/api/settings/netbox"),
            api<LogsResponse>("/api/logs?limit=100&app_limit=100"),
        ]);

    return {
        devices: devicesResponse.devices,
        bots: botsResponse.bots,
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
