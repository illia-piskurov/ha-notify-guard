import type { Device } from "$lib/api/types";

export type StatusBadgeVariant =
    | "default"
    | "secondary"
    | "destructive"
    | "outline";

export function statusVariant(status: string): StatusBadgeVariant {
    if (status === "offline" || status === "closed") {
        return "destructive";
    }

    if (status === "online" || status === "open") {
        return "default";
    }

    return "outline";
}

export function statusLabel(
    kind: "ping" | "modbus",
    status: string,
): string | null {
    if (
        status !== "online" &&
        status !== "offline" &&
        status !== "open" &&
        status !== "closed"
    ) {
        return null;
    }

    return `${kind}: ${status}`;
}

export function nextAssignedBotIds(
    device: Pick<Device, "assignedBotIds">,
    botId: number,
    checked: boolean,
): number[] {
    const current = new Set(device.assignedBotIds);
    if (checked) {
        current.add(botId);
    } else {
        current.delete(botId);
    }

    return Array.from(current);
}
