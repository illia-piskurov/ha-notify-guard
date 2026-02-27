<script lang="ts">
    import { get } from "svelte/store";
    import { _ } from "svelte-i18n";
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import { Badge } from "$lib/components/ui/badge/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import * as Table from "$lib/components/ui/table/index.js";
    import { api } from "$lib/api/client";
    import type {
        Device,
        DeviceHistorySlice,
        DevicePort,
        HistoryPeriod,
    } from "$lib/api/types";
    import { appLocaleStore } from "$lib/stores/preferences";
    import HistoryFeatureContent from "$lib/components/features/HistoryFeatureContent.svelte";
    import {
        deleteDevicePort,
        fetchDevicePorts,
        scanCustomDevicePort,
        scanDevicePorts,
        updateDevicePortMonitor,
    } from "$lib/services/app-data";

    let {
        open = $bindable(false),
        device,
        onNotify,
    }: {
        open?: boolean;
        device: Device | null;
        onNotify: (message: string, kind: "success" | "error") => void;
    } = $props();

    let isHistoryLoading = $state(false);
    let historyDeviceId = $state<number | null>(null);
    let historyDeviceName = $state("");
    let historyDeviceIp = $state("");
    let historyDeviceExists = $state<boolean | null>(null);
    let historyMonitorPing = $state(false);
    let historyPeriod = $state<HistoryPeriod>("24h");
    let historySlices = $state<DeviceHistorySlice[]>([]);

    let ports = $state<DevicePort[]>([]);
    let openPorts = $state<DevicePort[]>([]);
    let isPortsLoading = $state(false);
    let isPortsScanning = $state(false);
    let customPort = $state<string | number>("");
    let isCustomPortScanning = $state(false);
    let customPortError = $state("");
    let customPortResult = $state("");
    let customPortStatus = $state<"open" | "closed" | "">("");
    let portsWithStatus = $derived(
        ports.filter(
            (item) => item.monitorEnabled || item.lastStatus === "open",
        ),
    );

    let openedForDeviceId = $state<number | null>(null);

    $effect(() => {
        if (!open || !device) {
            return;
        }

        if (openedForDeviceId === device.id) {
            return;
        }

        openedForDeviceId = device.id;
        void openDeviceHistory(device);
    });

    $effect(() => {
        if (!open) {
            openedForDeviceId = null;
            isHistoryLoading = false;
            historyDeviceId = null;
            historyDeviceName = "";
            historyDeviceIp = "";
            historyDeviceExists = null;
            historyMonitorPing = false;
            historyPeriod = "24h";
            historySlices = [];
            ports = [];
            openPorts = [];
            isPortsLoading = false;
            isPortsScanning = false;
            customPort = "";
            isCustomPortScanning = false;
            customPortError = "";
            customPortResult = "";
            customPortStatus = "";
        }
    });

    function t(
        key: string,
        values?: Record<
            string,
            string | number | boolean | Date | null | undefined
        >,
    ) {
        return values ? get(_)(key, { values }) : get(_)(key);
    }

    function toError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }

    function resolveActiveDeviceId(): number | null {
        if (historyDeviceId !== null) {
            return historyDeviceId;
        }

        return device?.id ?? null;
    }

    function parseCustomPort(value: string | number): number {
        const normalized = String(value ?? "").trim();
        return Number(normalized);
    }

    async function openDeviceHistory(nextDevice: Device) {
        isHistoryLoading = true;
        historyDeviceId = nextDevice.id;
        historyDeviceName = nextDevice.name;
        historyDeviceIp = nextDevice.ip;
        historyDeviceExists = null;
        historyMonitorPing = nextDevice.monitorPing;
        historySlices = [];

        await loadDevicePorts(nextDevice.id);
        await loadDeviceHistory(nextDevice.id);
    }

    async function loadDevicePorts(deviceId: number) {
        isPortsLoading = true;

        try {
            const response = await fetchDevicePorts(deviceId);
            ports = response.ports;
            openPorts = response.ports.filter(
                (item) => item.lastStatus === "open",
            );
        } catch (error) {
            onNotify(toError(error), "error");
            ports = [];
            openPorts = [];
        } finally {
            isPortsLoading = false;
        }
    }

    async function scanPorts() {
        const activeDeviceId = resolveActiveDeviceId();
        if (activeDeviceId === null) {
            customPortError = t("history.ports.custom.noDevice");
            onNotify(t("history.ports.custom.noDevice"), "error");
            return;
        }

        customPortError = "";
        customPortResult = "";
        customPortStatus = "";

        isPortsScanning = true;

        try {
            const response = await scanDevicePorts(activeDeviceId);
            ports = response.ports;
            openPorts = response.ports.filter(
                (item) => item.lastStatus === "open",
            );
        } catch (error) {
            onNotify(toError(error), "error");
        } finally {
            isPortsScanning = false;
        }
    }

    async function togglePortMonitor(port: number, checked: boolean) {
        const activeDeviceId = resolveActiveDeviceId();
        if (activeDeviceId === null) {
            onNotify(t("history.ports.custom.noDevice"), "error");
            return;
        }

        try {
            const response = await updateDevicePortMonitor(
                activeDeviceId,
                port,
                checked,
            );
            ports = response.ports;
            openPorts = response.ports.filter(
                (item) => item.lastStatus === "open",
            );
        } catch (error) {
            onNotify(toError(error), "error");
        }
    }

    async function scanCustomPort() {
        const activeDeviceId = resolveActiveDeviceId();
        if (activeDeviceId === null) {
            customPortError = t("history.ports.custom.noDevice");
            onNotify(t("history.ports.custom.noDevice"), "error");
            return;
        }

        customPortError = "";
        customPortResult = "";
        customPortStatus = "";

        const parsedPort = parseCustomPort(customPort);
        if (
            !Number.isInteger(parsedPort) ||
            parsedPort < 1 ||
            parsedPort > 65535
        ) {
            customPortError = t("history.ports.custom.invalid");
            return;
        }

        isCustomPortScanning = true;
        customPortResult = t("history.ports.custom.pending", {
            port: parsedPort,
        });

        try {
            const response = await scanCustomDevicePort(
                activeDeviceId,
                parsedPort,
            );
            ports = response.ports;
            openPorts = response.ports.filter(
                (item) => item.lastStatus === "open",
            );

            const scannedPort = response.ports.find(
                (item) => item.port === parsedPort,
            );
            const status = scannedPort?.lastStatus;

            if (status === "open" || status === "closed") {
                const message = t("history.ports.custom.result", {
                    port: parsedPort,
                    status,
                });
                customPortResult = message;
                customPortStatus = status;
                onNotify(message, status === "open" ? "success" : "error");
            } else {
                const message = t("history.ports.custom.done", {
                    port: parsedPort,
                });
                customPortResult = message;
                customPortStatus = "closed";
                onNotify(message, "success");
            }
        } catch (error) {
            customPortError = toError(error);
            customPortStatus = "";
            onNotify(toError(error), "error");
        } finally {
            isCustomPortScanning = false;
        }
    }

    async function removeCustomPort(port: number) {
        const activeDeviceId = resolveActiveDeviceId();
        if (activeDeviceId === null) {
            onNotify(t("history.ports.custom.noDevice"), "error");
            return;
        }

        try {
            const response = await deleteDevicePort(activeDeviceId, port);
            ports = response.ports;
            openPorts = response.ports.filter(
                (item) => item.lastStatus === "open",
            );
            onNotify(t("history.ports.custom.deleted", { port }), "success");
        } catch (error) {
            onNotify(toError(error), "error");
        }
    }

    async function loadDeviceHistory(deviceId: number) {
        isHistoryLoading = true;

        try {
            const response = await api<{
                success: boolean;
                exists: boolean;
                period: HistoryPeriod;
                device: {
                    id: number;
                    name: string;
                    ip: string;
                    monitorPing: boolean;
                } | null;
                slices: DeviceHistorySlice[];
            }>(`/api/devices/${deviceId}/history?period=${historyPeriod}`);

            historyDeviceExists = response.exists;
            historySlices = response.slices;

            if (response.device) {
                historyDeviceName = response.device.name;
                historyDeviceIp = response.device.ip;
                historyMonitorPing = response.device.monitorPing;
            }
        } catch (error) {
            onNotify(toError(error), "error");
            historyDeviceExists = true;
            historySlices = [];
        } finally {
            isHistoryLoading = false;
        }
    }

    async function changeHistoryPeriod(period: HistoryPeriod) {
        historyPeriod = period;

        if (historyDeviceId !== null) {
            await loadDeviceHistory(historyDeviceId);
        }
    }

    function formatHistoryTime(value: string): string {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleString(
            get(appLocaleStore) === "uk" ? "uk-UA" : "en-US",
        );
    }

    function formatDuration(startedAt: string, endedAt: string | null): string {
        if (!endedAt) {
            return t("history.duration.ongoing");
        }

        const start = new Date(startedAt).getTime();
        const end = new Date(endedAt).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            return t("history.duration.invalid");
        }

        const totalMinutes = Math.floor((end - start) / 60000);
        const days = Math.floor(totalMinutes / (24 * 60));
        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
        const minutes = totalMinutes % 60;

        if (days > 0) {
            return t("history.duration.dhm", { days, hours, minutes });
        }

        if (hours > 0) {
            return t("history.duration.hm", { hours, minutes });
        }

        return t("history.duration.m", { minutes });
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-2xl">
        <Dialog.Header>
            <Dialog.Title>{$_("history.title")}</Dialog.Title>
            <Dialog.Description>
                {historyDeviceName} ({historyDeviceIp})
            </Dialog.Description>
        </Dialog.Header>

        <section class="mb-4 rounded-md border p-3">
            <div class="mb-3 flex items-center justify-between gap-2">
                <h3 class="text-sm font-medium">{$_("history.ports.title")}</h3>
                <div class="flex flex-col items-end gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onclick={scanPorts}
                        disabled={isPortsScanning ||
                            isPortsLoading ||
                            resolveActiveDeviceId() === null}
                    >
                        {isPortsScanning
                            ? $_("history.ports.scanning")
                            : $_("history.ports.scanKnown")}
                    </Button>
                    <div class="flex flex-col items-end gap-1">
                        <span class="text-muted-foreground text-[11px]">
                            {$_("history.ports.custom.title")}
                        </span>
                        <div class="flex items-center gap-2">
                            <input
                                class="bg-background border-input w-28 rounded-md border px-2 py-1 text-xs"
                                type="number"
                                min="1"
                                max="65535"
                                bind:value={customPort}
                                placeholder={$_(
                                    "history.ports.custom.placeholder",
                                )}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                onclick={scanCustomPort}
                                disabled={isCustomPortScanning ||
                                    isPortsLoading ||
                                    resolveActiveDeviceId() === null}
                            >
                                {isCustomPortScanning
                                    ? $_("history.ports.custom.scanning")
                                    : $_("history.ports.custom.scan")}
                            </Button>
                        </div>
                        {#if customPortError}
                            <p class="text-destructive text-[11px]">
                                {customPortError}
                            </p>
                        {:else if customPortResult}
                            <div
                                class={`rounded-md border px-2 py-1 text-xs ${
                                    customPortStatus === "open"
                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                        : customPortStatus === "closed"
                                          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                          : "border-muted bg-muted/30 text-muted-foreground"
                                }`}
                            >
                                <p>{customPortResult}</p>
                                {#if customPortStatus === "open"}
                                    <p>{$_("history.ports.custom.openHint")}</p>
                                {:else if customPortStatus === "closed"}
                                    <p>
                                        {$_("history.ports.custom.closedHint")}
                                    </p>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

            {#if isPortsLoading}
                <p class="text-muted-foreground text-xs">
                    {$_("history.ports.loading")}
                </p>
            {:else if portsWithStatus.length === 0}
                <p class="text-muted-foreground text-xs">
                    {$_("history.ports.empty")}
                </p>
            {:else}
                <Table.Root class="text-xs">
                    <Table.Header>
                        <Table.Row>
                            <Table.Head
                                >{$_("history.ports.table.service")}</Table.Head
                            >
                            <Table.Head
                                >{$_("history.ports.table.port")}</Table.Head
                            >
                            <Table.Head
                                >{$_("history.ports.table.status")}</Table.Head
                            >
                            <Table.Head
                                >{$_("history.ports.table.monitor")}</Table.Head
                            >
                            <Table.Head
                                >{$_("history.ports.table.action")}</Table.Head
                            >
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each portsWithStatus as port (port.port)}
                            <Table.Row>
                                <Table.Cell>
                                    <div class="flex items-center gap-2">
                                        <span>{port.label}</span>
                                        {#if port.label.startsWith("TCP ")}
                                            <Badge variant="outline">
                                                {$_(
                                                    "history.ports.custom.badge",
                                                )}
                                            </Badge>
                                        {/if}
                                    </div>
                                </Table.Cell>
                                <Table.Cell>{port.port}</Table.Cell>
                                <Table.Cell>
                                    <Badge
                                        variant={port.lastStatus === "open"
                                            ? "default"
                                            : "destructive"}
                                    >
                                        {port.lastStatus}
                                    </Badge>
                                </Table.Cell>
                                <Table.Cell>
                                    <Switch
                                        checked={port.monitorEnabled}
                                        onCheckedChange={(checked) =>
                                            togglePortMonitor(
                                                port.port,
                                                Boolean(checked),
                                            )}
                                    />
                                </Table.Cell>
                                <Table.Cell>
                                    {#if port.label.startsWith("TCP ")}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onclick={() =>
                                                removeCustomPort(port.port)}
                                            disabled={port.monitorEnabled}
                                        >
                                            {$_("history.ports.custom.delete")}
                                        </Button>
                                    {:else}
                                        <span
                                            class="text-muted-foreground text-xs"
                                            >—</span
                                        >
                                    {/if}
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            {/if}
        </section>

        <HistoryFeatureContent
            {historyPeriod}
            {changeHistoryPeriod}
            {isHistoryLoading}
            {historyDeviceExists}
            {historySlices}
            {historyMonitorPing}
            {formatHistoryTime}
            {formatDuration}
        />
    </Dialog.Content>
</Dialog.Root>
