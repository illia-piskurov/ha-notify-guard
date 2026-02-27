import { get, writable } from "svelte/store";
import type { Device } from "$lib/api/types";

export type DeviceSortKey = "name" | "ip" | "ping" | "bots";
export type SortDirection = "asc" | "desc";

export const deviceSearchQueryStore = writable("");
export const onlyModbusStore = writable(false);
export const deviceSortKeyStore = writable<DeviceSortKey>("name");
export const deviceSortDirectionStore = writable<SortDirection>("asc");

export function setDeviceSearchQuery(value: string) {
    deviceSearchQueryStore.set(value);
}

export function toggleOnlyModbus() {
    onlyModbusStore.update((value) => !value);
}

export function resetDeviceFilters() {
    deviceSearchQueryStore.set("");
    onlyModbusStore.set(false);
    deviceSortKeyStore.set("name");
    deviceSortDirectionStore.set("asc");
}

export function toggleDeviceSort(key: DeviceSortKey) {
    const currentKey = get(deviceSortKeyStore);
    const currentDirection = get(deviceSortDirectionStore);

    if (currentKey === key) {
        deviceSortDirectionStore.set(currentDirection === "asc" ? "desc" : "asc");
        return;
    }

    deviceSortKeyStore.set(key);
    deviceSortDirectionStore.set(defaultSortDirection(key));
}

export function sortIndicator(key: DeviceSortKey): string {
    const activeKey = get(deviceSortKeyStore);
    const direction = get(deviceSortDirectionStore);

    if (activeKey !== key) {
        return "↕";
    }

    return direction === "asc" ? "↑" : "↓";
}

export function filterDevices(
    devices: Device[],
    query: string,
    onlyModbus: boolean,
): Device[] {
    return devices.filter((device) => {
        if (onlyModbus && !device.hasModbusTag) {
            return false;
        }

        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return true;
        }

        return device.name.toLowerCase().includes(normalizedQuery);
    });
}

export function sortDevices(
    devices: Device[],
    key: DeviceSortKey,
    direction: SortDirection,
): Device[] {
    return [...devices].sort((left, right) =>
        compareDevices(left, right, key, direction),
    );
}

function defaultSortDirection(key: DeviceSortKey): SortDirection {
    if (key === "ping" || key === "bots") {
        return "desc";
    }

    return "asc";
}

function compareDevices(
    left: Device,
    right: Device,
    key: DeviceSortKey,
    direction: SortDirection,
): number {
    const factor = direction === "asc" ? 1 : -1;

    if (key === "name") {
        return (
            left.name.localeCompare(right.name, undefined, {
                sensitivity: "base",
            }) * factor
        );
    }

    if (key === "ip") {
        return compareIp(left.ip, right.ip) * factor;
    }

    if (key === "ping") {
        return (Number(left.monitorPing) - Number(right.monitorPing)) * factor;
    }

    return (left.assignedBotIds.length - right.assignedBotIds.length) * factor;
}

function compareIp(leftIp: string, rightIp: string): number {
    const leftParts = leftIp.split(".").map((part) => Number(part));
    const rightParts = rightIp.split(".").map((part) => Number(part));

    if (
        leftParts.length === 4 &&
        rightParts.length === 4 &&
        leftParts.every((part) => Number.isFinite(part)) &&
        rightParts.every((part) => Number.isFinite(part))
    ) {
        for (let index = 0; index < 4; index += 1) {
            const diff = leftParts[index] - rightParts[index];
            if (diff !== 0) {
                return diff;
            }
        }

        return 0;
    }

    return leftIp.localeCompare(rightIp, undefined, { numeric: true });
}
