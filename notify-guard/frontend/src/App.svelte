<script lang="ts">
    import { onMount } from "svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Badge } from "$lib/components/ui/badge/index.js";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import { Checkbox } from "$lib/components/ui/checkbox/index.js";
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Table from "$lib/components/ui/table/index.js";

    type Device = {
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

    type Bot = {
        id: number;
        name: string;
        chatId: string;
        isActive: boolean;
    };

    type NetboxSettings = {
        netbox_url: string;
        netbox_token: string;
        poll_seconds: number;
    };

    type Toast = {
        id: number;
        message: string;
        kind: "success" | "error";
    };

    type DeviceHistorySlice = {
        status: "online" | "offline";
        startedAt: string;
        endedAt: string | null;
    };

    type HistoryPeriod = "24h" | "7d" | "30d" | "all";

    type DeviceSortKey = "name" | "ip" | "ping" | "modbus" | "bots";
    type SortDirection = "asc" | "desc";

    let activeTab = $state<"devices" | "bots">("devices");
    let devices = $state<Device[]>([]);
    let bots = $state<Bot[]>([]);
    let settings = $state<NetboxSettings>({
        netbox_url: "",
        netbox_token: "",
        poll_seconds: 30,
    });

    let isLoading = $state(false);
    let isSyncing = $state(false);
    let isDarkTheme = $state(false);
    let toasts = $state<Toast[]>([]);
    let deviceSearchQuery = $state("");
    let onlyModbus = $state(false);
    let deviceSortKey = $state<DeviceSortKey>("name");
    let deviceSortDirection = $state<SortDirection>("asc");

    let newBotName = $state("");
    let newBotToken = $state("");
    let newBotChatId = $state("");
    let newBotActive = $state(true);

    let isHistoryDialogOpen = $state(false);
    let isHistoryLoading = $state(false);
    let historyDeviceId = $state<number | null>(null);
    let historyDeviceName = $state("");
    let historyDeviceIp = $state("");
    let historyDeviceExists = $state<boolean | null>(null);
    let historyMonitorPing = $state(false);
    let historyPeriod = $state<HistoryPeriod>("24h");
    let historySlices = $state<DeviceHistorySlice[]>([]);

    let filteredDevices = $derived(
        devices.filter((device) => {
            if (onlyModbus && !device.hasModbusTag) {
                return false;
            }

            const query = deviceSearchQuery.trim().toLowerCase();
            if (!query) {
                return true;
            }

            return device.name.toLowerCase().includes(query);
        }),
    );

    let sortedDevices = $derived(
        [...filteredDevices].sort((left, right) =>
            compareDevices(left, right, deviceSortKey, deviceSortDirection),
        ),
    );

    onMount(async () => {
        initializeTheme();
        await loadAll();
    });

    function initializeTheme() {
        if (typeof window === "undefined") {
            return;
        }

        const root = document.documentElement;
        const savedTheme = localStorage.getItem("notify-guard-theme");

        const shouldUseDark = savedTheme
            ? savedTheme === "dark"
            : root.classList.contains("dark") ||
              window.matchMedia("(prefers-color-scheme: dark)").matches;

        isDarkTheme = shouldUseDark;
        applyTheme(shouldUseDark);
    }

    function applyTheme(isDark: boolean) {
        if (typeof window === "undefined") {
            return;
        }

        const root = document.documentElement;
        root.classList.toggle("dark", isDark);
        localStorage.setItem("notify-guard-theme", isDark ? "dark" : "light");
    }

    function toggleTheme(checked: boolean) {
        isDarkTheme = checked;
        applyTheme(checked);
    }

    async function loadAll() {
        isLoading = true;

        try {
            const [devicesResponse, botsResponse, settingsResponse] =
                await Promise.all([
                    api<{ devices: Device[] }>("/api/devices"),
                    api<{ bots: Bot[] }>("/api/bots"),
                    api<NetboxSettings>("/api/settings/netbox"),
                ]);

            devices = devicesResponse.devices;
            bots = botsResponse.bots;
            settings = settingsResponse;
        } catch (error) {
            pushToast(toError(error), "error");
        } finally {
            isLoading = false;
        }
    }

    async function saveNetboxSettings() {
        try {
            const response = await api<{
                success: boolean;
                settings: NetboxSettings;
            }>("/api/settings/netbox", {
                method: "PUT",
                body: JSON.stringify(settings),
            });

            settings = response.settings;
            pushToast("Налаштування NetBox збережено", "success");
        } catch (error) {
            pushToast(toError(error), "error");
        }
    }

    async function syncNetbox() {
        isSyncing = true;

        try {
            const response = await api<{
                success: boolean;
                synced: number;
                total: number;
            }>("/api/netbox/sync", {
                method: "POST",
            });

            pushToast(
                `Синхронізація завершена: ${response.synced}/${response.total}`,
                "success",
            );
            await loadAll();
        } catch (error) {
            pushToast(toError(error), "error");
        } finally {
            isSyncing = false;
        }
    }

    async function updateDevice(
        deviceId: number,
        patch: Partial<
            Pick<Device, "monitorPing" | "monitorModbus" | "assignedBotIds">
        >,
    ) {
        try {
            const response = await api<{ success: boolean; device: Device }>(
                `/api/devices/${deviceId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify(patch),
                },
            );

            devices = devices.map((device) =>
                device.id === deviceId ? response.device : device,
            );
        } catch (error) {
            pushToast(toError(error), "error");
            await loadAll();
        }
    }

    async function createBot() {
        try {
            await api<{ success: boolean; id: number }>("/api/bots", {
                method: "POST",
                body: JSON.stringify({
                    name: newBotName,
                    token: newBotToken,
                    chatId: newBotChatId,
                    isActive: newBotActive,
                }),
            });

            newBotName = "";
            newBotToken = "";
            newBotChatId = "";
            newBotActive = true;

            pushToast("Бота додано", "success");
            await loadAll();
        } catch (error) {
            pushToast(toError(error), "error");
        }
    }

    async function toggleBot(bot: Bot, isActive: boolean) {
        try {
            await api<{ success: boolean }>(`/api/bots/${bot.id}`, {
                method: "PATCH",
                body: JSON.stringify({ isActive }),
            });

            bots = bots.map((item) =>
                item.id === bot.id ? { ...item, isActive } : item,
            );
        } catch (error) {
            pushToast(toError(error), "error");
            await loadAll();
        }
    }

    async function deleteBot(botId: number) {
        try {
            await api<{ success: boolean }>(`/api/bots/${botId}`, {
                method: "DELETE",
            });

            pushToast("Бота видалено", "success");
            await loadAll();
        } catch (error) {
            pushToast(toError(error), "error");
        }
    }

    async function api<T>(url: string, init?: RequestInit): Promise<T> {
        const response = await fetch(url, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                ...(init?.headers ?? {}),
            },
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(payload?.error || `HTTP ${response.status}`);
        }

        return payload as T;
    }

    function toggleAssignedBot(
        device: Device,
        botId: number,
        checked: boolean,
    ) {
        const current = new Set(device.assignedBotIds);
        if (checked) {
            current.add(botId);
        } else {
            current.delete(botId);
        }

        const nextAssigned = Array.from(current);
        updateDevice(device.id, { assignedBotIds: nextAssigned });
    }

    function statusVariant(
        status: string,
    ): "default" | "secondary" | "destructive" | "outline" {
        if (status === "offline" || status === "closed") {
            return "destructive";
        }

        if (status === "online" || status === "open") {
            return "default";
        }

        return "outline";
    }

    function statusLabel(
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

    function toError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }

    function pushToast(message: string, kind: "success" | "error") {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        toasts = [...toasts, { id, message, kind }];

        setTimeout(() => {
            toasts = toasts.filter((toast) => toast.id !== id);
        }, 3500);
    }

    function removeToast(id: number) {
        toasts = toasts.filter((toast) => toast.id !== id);
    }

    function toggleDeviceSort(key: DeviceSortKey) {
        if (deviceSortKey === key) {
            deviceSortDirection = deviceSortDirection === "asc" ? "desc" : "asc";
            return;
        }

        deviceSortKey = key;
        deviceSortDirection = defaultSortDirection(key);
    }

    function defaultSortDirection(key: DeviceSortKey): SortDirection {
        if (key === "ping" || key === "modbus" || key === "bots") {
            return "desc";
        }

        return "asc";
    }

    function sortIndicator(key: DeviceSortKey): string {
        if (deviceSortKey !== key) {
            return "↕";
        }

        return deviceSortDirection === "asc" ? "↑" : "↓";
    }

    function resetDeviceFilters() {
        deviceSearchQuery = "";
        onlyModbus = false;
        deviceSortKey = "name";
        deviceSortDirection = "asc";
    }

    function compareDevices(
        left: Device,
        right: Device,
        key: DeviceSortKey,
        direction: SortDirection,
    ): number {
        const factor = direction === "asc" ? 1 : -1;

        if (key === "name") {
            return left.name.localeCompare(right.name, undefined, {
                sensitivity: "base",
            }) * factor;
        }

        if (key === "ip") {
            return compareIp(left.ip, right.ip) * factor;
        }

        if (key === "ping") {
            return (Number(left.monitorPing) - Number(right.monitorPing)) * factor;
        }

        if (key === "modbus") {
            return (
                Number(left.monitorModbus) - Number(right.monitorModbus)
            ) * factor;
        }

        return (
            left.assignedBotIds.length - right.assignedBotIds.length
        ) * factor;
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

    async function openDeviceHistory(device: Device) {
        isHistoryDialogOpen = true;
        isHistoryLoading = true;
        historyDeviceId = device.id;
        historyDeviceName = device.name;
        historyDeviceIp = device.ip;
        historyDeviceExists = null;
        historyMonitorPing = device.monitorPing;
        historySlices = [];

        await loadDeviceHistory(device.id);
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
            pushToast(toError(error), "error");
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

        return date.toLocaleString();
    }

    function formatDuration(startedAt: string, endedAt: string | null): string {
        if (!endedAt) {
            return "триває";
        }

        const start = new Date(startedAt).getTime();
        const end = new Date(endedAt).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            return "—";
        }

        const totalMinutes = Math.floor((end - start) / 60000);
        const days = Math.floor(totalMinutes / (24 * 60));
        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
        const minutes = totalMinutes % 60;

        if (days > 0) {
            return `${days}д ${hours}г ${minutes}хв`;
        }

        if (hours > 0) {
            return `${hours}г ${minutes}хв`;
        }

        return `${minutes}хв`;
    }
</script>

<main class="flex min-h-screen w-full flex-col gap-3 p-3 md:p-4">
    <section class="flex flex-wrap items-center justify-between gap-3">
        <div>
            <h1 class="text-2xl font-semibold">Notify Guard</h1>
            <p class="text-muted-foreground text-sm">
                Моніторинг пристроїв з NetBox + Telegram сповіщення
            </p>
        </div>

        <div class="flex items-center gap-2">
            <div class="mr-1 flex items-center gap-2">
                <span class="text-muted-foreground text-xs">🌙</span>
                <Switch
                    checked={isDarkTheme}
                    onCheckedChange={(checked) => toggleTheme(Boolean(checked))}
                />
            </div>
            <Button
                variant={activeTab === "devices" ? "default" : "outline"}
                onclick={() => (activeTab = "devices")}
            >
                Пристрої
            </Button>
            <Button
                variant={activeTab === "bots" ? "default" : "outline"}
                onclick={() => (activeTab = "bots")}
            >
                Боти
            </Button>
            <Button variant="secondary" onclick={loadAll} disabled={isLoading}
                >Оновити</Button
            >
        </div>
    </section>

    {#if activeTab === "devices"}
        <section class="flex min-h-0 flex-1 flex-col gap-3">
            <div class="rounded-lg border p-4">
                <h2 class="text-lg font-medium">NetBox</h2>
                <div class="mt-3 grid gap-3 lg:grid-cols-3">
                    <div class="space-y-2">
                        <label class="text-sm font-medium" for="netbox-url"
                            >URL API</label
                        >
                        <input
                            id="netbox-url"
                            class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                            bind:value={settings.netbox_url}
                            placeholder="https://netbox.local/api"
                        />
                    </div>

                    <div class="space-y-2">
                        <label class="text-sm font-medium" for="netbox-token"
                            >Token</label
                        >
                        <input
                            id="netbox-token"
                            class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                            bind:value={settings.netbox_token}
                            placeholder="NetBox API token"
                        />
                    </div>

                    <div class="space-y-2">
                        <label class="text-sm font-medium" for="poll-seconds"
                            >Інтервал моніторингу, сек</label
                        >
                        <input
                            id="poll-seconds"
                            class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                            bind:value={settings.poll_seconds}
                            type="number"
                            min="5"
                        />
                    </div>
                </div>

                <div class="mt-3 flex flex-wrap gap-2">
                    <Button onclick={saveNetboxSettings}>Зберегти</Button>
                    <Button
                        variant="secondary"
                        onclick={syncNetbox}
                        disabled={isSyncing}
                    >
                        {isSyncing ? "Синхронізація..." : "Синхронізувати"}
                    </Button>
                </div>
            </div>

            <div class="flex min-h-0 flex-1 flex-col rounded-lg border">
                <div class="flex flex-wrap items-center justify-between gap-2 p-2 pb-0">
                    <input
                        class="bg-background border-input w-full max-w-md rounded-md border px-3 py-2 text-sm"
                        placeholder="Пошук пристрою по імені"
                        bind:value={deviceSearchQuery}
                    />

                    <div class="flex items-center gap-2">
                        <Button
                            variant={onlyModbus ? "default" : "outline"}
                            onclick={() => (onlyModbus = !onlyModbus)}
                        >
                            Тільки modbus
                        </Button>
                        <Button variant="outline" onclick={resetDeviceFilters}>
                            Скинути фільтри
                        </Button>
                    </div>
                </div>

                <div class="min-h-0 flex-1 overflow-auto p-2">
                    <Table.Root>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>
                                    <button
                                        class="hover:text-foreground/80 inline-flex items-center gap-1"
                                        onclick={() => toggleDeviceSort("name")}
                                        type="button"
                                    >
                                        Пристрій
                                        <span class="text-foreground text-sm font-semibold leading-none">{sortIndicator("name")}</span>
                                    </button>
                                </Table.Head>
                                <Table.Head>
                                    <button
                                        class="hover:text-foreground/80 inline-flex items-center gap-1"
                                        onclick={() => toggleDeviceSort("ip")}
                                        type="button"
                                    >
                                        IP
                                        <span class="text-foreground text-sm font-semibold leading-none">{sortIndicator("ip")}</span>
                                    </button>
                                </Table.Head>
                                <Table.Head>
                                    <button
                                        class="hover:text-foreground/80 inline-flex items-center gap-1"
                                        onclick={() => toggleDeviceSort("ping")}
                                        type="button"
                                    >
                                        Ping
                                        <span class="text-foreground text-sm font-semibold leading-none">{sortIndicator("ping")}</span>
                                    </button>
                                </Table.Head>
                                <Table.Head>
                                    <button
                                        class="hover:text-foreground/80 inline-flex items-center gap-1"
                                        onclick={() => toggleDeviceSort("modbus")}
                                        type="button"
                                    >
                                        Modbus
                                        <span class="text-foreground text-sm font-semibold leading-none">{sortIndicator("modbus")}</span>
                                    </button>
                                </Table.Head>
                                <Table.Head>
                                    <button
                                        class="hover:text-foreground/80 inline-flex items-center gap-1"
                                        onclick={() => toggleDeviceSort("bots")}
                                        type="button"
                                    >
                                        Боти
                                        <span class="text-foreground text-sm font-semibold leading-none">{sortIndicator("bots")}</span>
                                    </button>
                                </Table.Head>
                                <Table.Head>Статус</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {#if sortedDevices.length === 0}
                                <Table.Row>
                                    <Table.Cell
                                        colspan={6}
                                        class="text-muted-foreground py-5 text-center"
                                    >
                                        Нічого не знайдено за поточним фільтром.
                                    </Table.Cell>
                                </Table.Row>
                            {/if}

                            {#each sortedDevices as device (device.id)}
                                <Table.Row>
                                    <Table.Cell>
                                        <div class="flex items-center gap-2">
                                            <button
                                                class="hover:text-foreground/80 text-left font-medium underline-offset-2 hover:underline"
                                                onclick={() =>
                                                    openDeviceHistory(device)}
                                                type="button"
                                            >
                                                {device.name}
                                            </button>
                                            {#if device.hasModbusTag}
                                                <Badge variant="secondary"
                                                    >modbus</Badge
                                                >
                                            {/if}
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>{device.ip}</Table.Cell>
                                    <Table.Cell>
                                        <Switch
                                            checked={device.monitorPing}
                                            onCheckedChange={(checked) =>
                                                updateDevice(device.id, {
                                                    monitorPing: Boolean(
                                                        checked,
                                                    ),
                                                })}
                                        />
                                    </Table.Cell>
                                    <Table.Cell>
                                        {#if device.hasModbusTag}
                                            <Switch
                                                checked={device.monitorModbus}
                                                onCheckedChange={(checked) =>
                                                    updateDevice(device.id, {
                                                        monitorModbus: Boolean(
                                                            checked,
                                                        ),
                                                    })}
                                            />
                                        {:else}
                                            <span
                                                class="text-muted-foreground text-xs"
                                                >—</span
                                            >
                                        {/if}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div class="flex flex-col gap-2">
                                            {#if bots.length === 0}
                                                <span
                                                    class="text-muted-foreground text-xs"
                                                    >Додайте бота у вкладці "Боти"</span
                                                >
                                            {/if}
                                            {#each bots as bot (bot.id)}
                                                <label
                                                    class="flex items-center gap-2 text-xs"
                                                >
                                                    <Checkbox
                                                        checked={device.assignedBotIds.includes(
                                                            bot.id,
                                                        )}
                                                        onCheckedChange={(
                                                            checked,
                                                        ) =>
                                                            toggleAssignedBot(
                                                                device,
                                                                bot.id,
                                                                Boolean(checked),
                                                            )}
                                                    />
                                                    <span>{bot.name}</span>
                                                </label>
                                            {/each}
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div class="flex flex-col gap-1">
                                            {#if statusLabel("ping", device.lastPingStatus)}
                                                <Badge
                                                    variant={statusVariant(
                                                        device.lastPingStatus,
                                                    )}
                                                >
                                                    {statusLabel(
                                                        "ping",
                                                        device.lastPingStatus,
                                                    )}
                                                </Badge>
                                            {/if}
                                            {#if statusLabel("modbus", device.lastModbusStatus)}
                                                <Badge
                                                    variant={statusVariant(
                                                        device.lastModbusStatus,
                                                    )}
                                                >
                                                    {statusLabel(
                                                        "modbus",
                                                        device.lastModbusStatus,
                                                    )}
                                                </Badge>
                                            {/if}
                                            {#if !statusLabel("ping", device.lastPingStatus) && !statusLabel("modbus", device.lastModbusStatus)}
                                                <span
                                                    class="text-muted-foreground text-xs"
                                                    >—</span
                                                >
                                            {/if}
                                        </div>
                                    </Table.Cell>
                                </Table.Row>
                            {/each}
                        </Table.Body>
                    </Table.Root>
                </div>
            </div>
        </section>
    {/if}

    {#if activeTab === "bots"}
        <section class="grid gap-4 lg:grid-cols-3">
            <div class="space-y-3 rounded-lg border p-4">
                <h2 class="text-lg font-medium">Новий Telegram бот</h2>

                <div class="space-y-2">
                    <label class="text-sm font-medium" for="bot-name"
                        >Назва</label
                    >
                    <input
                        id="bot-name"
                        class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                        bind:value={newBotName}
                        placeholder="Main Bot"
                    />
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-medium" for="bot-token"
                        >Token</label
                    >
                    <input
                        id="bot-token"
                        class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                        bind:value={newBotToken}
                        placeholder="123456:ABC..."
                    />
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-medium" for="bot-chat"
                        >Chat ID</label
                    >
                    <input
                        id="bot-chat"
                        class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                        bind:value={newBotChatId}
                        placeholder="-1001234567890"
                    />
                </div>

                <label class="flex items-center gap-2 text-sm">
                    <Switch
                        checked={newBotActive}
                        onCheckedChange={(checked) =>
                            (newBotActive = Boolean(checked))}
                    />
                    Активний
                </label>

                <Button onclick={createBot}>Додати бота</Button>
            </div>

            <div class="overflow-x-auto rounded-lg border p-2 lg:col-span-2">
                <Table.Root>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head>Назва</Table.Head>
                            <Table.Head>Chat ID</Table.Head>
                            <Table.Head>Активний</Table.Head>
                            <Table.Head>Дія</Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#if bots.length === 0}
                            <Table.Row>
                                <Table.Cell
                                    colspan={4}
                                    class="text-muted-foreground py-5 text-center"
                                >
                                    Ще немає жодного бота.
                                </Table.Cell>
                            </Table.Row>
                        {/if}

                        {#each bots as bot (bot.id)}
                            <Table.Row>
                                <Table.Cell>{bot.name}</Table.Cell>
                                <Table.Cell>{bot.chatId}</Table.Cell>
                                <Table.Cell>
                                    <Switch
                                        checked={bot.isActive}
                                        onCheckedChange={(checked) =>
                                            toggleBot(bot, Boolean(checked))}
                                    />
                                </Table.Cell>
                                <Table.Cell>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onclick={() => deleteBot(bot.id)}
                                        >Видалити</Button
                                    >
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </div>
        </section>
    {/if}

    <Dialog.Root bind:open={isHistoryDialogOpen}>
        <Dialog.Content class="sm:max-w-2xl">
            <Dialog.Header>
                <Dialog.Title>Історія доступності</Dialog.Title>
                <Dialog.Description>
                    {historyDeviceName} ({historyDeviceIp})
                </Dialog.Description>
            </Dialog.Header>

            <div class="flex flex-wrap gap-2">
                <Button
                    variant={historyPeriod === "24h" ? "default" : "outline"}
                    size="sm"
                    onclick={() => changeHistoryPeriod("24h")}
                >
                    24h
                </Button>
                <Button
                    variant={historyPeriod === "7d" ? "default" : "outline"}
                    size="sm"
                    onclick={() => changeHistoryPeriod("7d")}
                >
                    7d
                </Button>
                <Button
                    variant={historyPeriod === "30d" ? "default" : "outline"}
                    size="sm"
                    onclick={() => changeHistoryPeriod("30d")}
                >
                    30d
                </Button>
                <Button
                    variant={historyPeriod === "all" ? "default" : "outline"}
                    size="sm"
                    onclick={() => changeHistoryPeriod("all")}
                >
                    all
                </Button>
            </div>

            {#if isHistoryLoading}
                <div class="text-muted-foreground py-4 text-sm">
                    Завантаження історії...
                </div>
            {:else if historyDeviceExists === false}
                <div class="text-muted-foreground py-4 text-sm">
                    Пристрою вже немає у базі. Історія недоступна.
                </div>
            {:else if historySlices.length === 0}
                <div class="text-muted-foreground py-4 text-sm">
                    Історії пінгу ще немає. Увімкніть моніторинг Ping для цього пристрою і зачекайте кілька циклів перевірки.
                    {#if !historyMonitorPing}
                        <div class="mt-2">Зараз моніторинг Ping вимкнений.</div>
                    {/if}
                </div>
            {:else}
                <div class="max-h-[60vh] overflow-auto rounded-md border">
                    <Table.Root>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>З</Table.Head>
                                <Table.Head>По</Table.Head>
                                <Table.Head>Статус</Table.Head>
                                <Table.Head>Тривалість</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {#each historySlices as slice, index (`${slice.startedAt}-${index}`)}
                                <Table.Row>
                                    <Table.Cell>
                                        {formatHistoryTime(slice.startedAt)}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {#if slice.endedAt}
                                            {formatHistoryTime(slice.endedAt)}
                                        {:else}
                                            зараз
                                        {/if}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge
                                            variant={slice.status === "online"
                                                ? "default"
                                                : "destructive"}
                                        >
                                            {slice.status}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>
                                        {formatDuration(
                                            slice.startedAt,
                                            slice.endedAt,
                                        )}
                                    </Table.Cell>
                                </Table.Row>
                            {/each}
                        </Table.Body>
                    </Table.Root>
                </div>
            {/if}
        </Dialog.Content>
    </Dialog.Root>

    <div class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {#each toasts as toast (toast.id)}
            <div
                class={`pointer-events-auto flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm shadow ${
                    toast.kind === "error"
                        ? "border-destructive/40 bg-destructive/10"
                        : "bg-secondary text-secondary-foreground"
                }`}
            >
                <span>{toast.message}</span>
                <button
                    class="text-muted-foreground hover:text-foreground text-xs"
                    onclick={() => removeToast(toast.id)}
                    type="button"
                >
                    ✕
                </button>
            </div>
        {/each}
    </div>
</main>
