<script lang="ts">
    import { get } from "svelte/store";
    import { _ } from "svelte-i18n";
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import { api } from "$lib/api/client";
    import type {
        Device,
        DeviceHistorySlice,
        HistoryPeriod,
    } from "$lib/api/types";
    import { appLocaleStore } from "$lib/stores/preferences";
    import HistoryFeatureContent from "$lib/components/features/HistoryFeatureContent.svelte";

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

    async function openDeviceHistory(nextDevice: Device) {
        isHistoryLoading = true;
        historyDeviceId = nextDevice.id;
        historyDeviceName = nextDevice.name;
        historyDeviceIp = nextDevice.ip;
        historyDeviceExists = null;
        historyMonitorPing = nextDevice.monitorPing;
        historySlices = [];

        await loadDeviceHistory(nextDevice.id);
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
