<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { _, locale } from "svelte-i18n";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import DevicesFeature from "$lib/components/features/DevicesFeature.svelte";
    import BotsFeature from "$lib/components/features/BotsFeature.svelte";
    import LogsFeature from "$lib/components/features/LogsFeature.svelte";
    import RestInboundFeature from "$lib/components/features/RestInboundFeature.svelte";
    import BotSettingsDialog from "$lib/components/features/BotSettingsDialog.svelte";
    import DeviceHistoryDialog from "$lib/components/features/DeviceHistoryDialog.svelte";
    import {
        type AppLogEntry,
        type Bot,
        type Device,
        type NetboxSettings,
        type NotificationLogEntry,
    } from "$lib/api/types";
    import {
        createBot as createBotRequest,
        deleteBot as deleteBotRequest,
        type DeviceUpdatePatch,
        fetchAppData,
        syncNetbox as syncNetboxRequest,
        updateDevice as updateDeviceRequest,
        updateNetboxSettings,
    } from "$lib/services/app-data";
    import {
        nextAssignedBotIds,
        statusLabel,
        statusVariant,
    } from "$lib/services/device-ui";
    import {
        appLocaleStore,
        initializeAppLocale,
        initializeTheme,
        isDarkThemeStore,
        setLanguage,
        toggleTheme,
    } from "$lib/stores/preferences";
    import { pushToast, removeToast, toastsStore } from "$lib/stores/toasts";
    import {
        deviceSearchQueryStore,
        deviceSortDirectionStore,
        deviceSortKeyStore,
        filterDevices,
        onlyModbusStore,
        resetDeviceFilters,
        setDeviceSearchQuery,
        sortDevices,
        sortIndicator,
        toggleDeviceSort,
        toggleOnlyModbus,
    } from "$lib/stores/device-filters";

    let activeTab = $state<"devices" | "bots" | "logs" | "rest">("devices");
    let devices = $state<Device[]>([]);
    let bots = $state<Bot[]>([]);
    let logs = $state<NotificationLogEntry[]>([]);
    let appLogs = $state<AppLogEntry[]>([]);
    let settings = $state<NetboxSettings>({
        netbox_url: "",
        netbox_token: "",
        poll_seconds: 30,
    });

    let isLoading = $state(false);
    let isSyncing = $state(false);
    let isLoadInFlight = false;

    const AUTO_REFRESH_STORAGE_KEY = "notify-guard-auto-refresh-seconds";
    const AUTO_REFRESH_OPTIONS = [5, 10, 30, 60] as const;
    let autoRefreshSeconds = $state<number>(10);
    let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

    let newBotName = $state("");
    let newBotToken = $state("");
    let isBotDialogOpen = $state(false);
    let selectedBotForSettings = $state<Bot | null>(null);

    let isHistoryDialogOpen = $state(false);
    let selectedDeviceForHistory = $state<Device | null>(null);

    let filteredDevices = $derived(
        filterDevices(devices, $deviceSearchQueryStore, $onlyModbusStore),
    );

    let sortedDevices = $derived(
        sortDevices(
            filteredDevices,
            $deviceSortKeyStore,
            $deviceSortDirectionStore,
        ),
    );

    onMount(() => {
        initializeAppLocale(get(locale));
        initializeTheme();

        autoRefreshSeconds = readStoredAutoRefreshSeconds();
        void loadAll();

        restartAutoRefreshTimer();

        return () => {
            if (autoRefreshTimer) {
                clearInterval(autoRefreshTimer);
                autoRefreshTimer = null;
            }
        };
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

    async function loadAll(options?: {
        showLoader?: boolean;
        notifyOnError?: boolean;
    }) {
        if (isLoadInFlight) {
            return;
        }

        isLoadInFlight = true;

        const showLoader = options?.showLoader ?? true;
        const notifyOnError = options?.notifyOnError ?? true;

        if (showLoader) {
            isLoading = true;
        }

        try {
            const payload = await fetchAppData();
            devices = payload.devices;
            bots = payload.bots;
            settings = payload.settings;
            logs = payload.logs;
            appLogs = payload.appLogs;
        } catch (error) {
            if (notifyOnError) {
                pushToast(toError(error), "error");
            }
        } finally {
            if (showLoader) {
                isLoading = false;
            }

            isLoadInFlight = false;
        }
    }

    async function saveNetboxSettings() {
        try {
            settings = await updateNetboxSettings(settings);
            pushToast(t("netbox.saved"), "success");
        } catch (error) {
            pushToast(toError(error), "error");
        }
    }

    async function syncNetbox() {
        isSyncing = true;

        try {
            const response = await syncNetboxRequest();

            pushToast(
                t("netbox.synced", {
                    synced: response.synced,
                    total: response.total,
                }),
                "success",
            );
            await loadAll();
        } catch (error) {
            pushToast(toError(error), "error");
        } finally {
            isSyncing = false;
        }
    }

    async function updateDevice(deviceId: number, patch: DeviceUpdatePatch) {
        try {
            const updatedDevice = await updateDeviceRequest(deviceId, patch);

            devices = devices.map((device) =>
                device.id === deviceId ? updatedDevice : device,
            );
        } catch (error) {
            pushToast(toError(error), "error");
            await loadAll();
        }
    }

    async function createBot() {
        if (!newBotName.trim() || !newBotToken.trim()) {
            pushToast(t("bots.validation.nameTokenRequired"), "error");
            return;
        }

        try {
            await createBotRequest(newBotName, newBotToken);

            newBotName = "";
            newBotToken = "";

            pushToast(t("bots.created"), "success");
            await loadAll();
        } catch (error) {
            pushToast(toError(error), "error");
        }
    }

    function openBotSettings(bot: Bot) {
        selectedBotForSettings = bot;
        isBotDialogOpen = true;
    }

    async function deleteBot(botId: number) {
        try {
            await deleteBotRequest(botId);

            pushToast(t("bots.deleted"), "success");
            await loadAll();
        } catch (error) {
            pushToast(toError(error), "error");
        }
    }

    function toggleAssignedBot(
        device: Device,
        botId: number,
        checked: boolean,
    ) {
        const nextAssigned = nextAssignedBotIds(device, botId, checked);
        updateDevice(device.id, { assignedBotIds: nextAssigned });
    }

    function toError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }

    function openDeviceHistory(device: Device) {
        selectedDeviceForHistory = device;
        isHistoryDialogOpen = true;
    }

    function readStoredAutoRefreshSeconds(): number {
        if (typeof window === "undefined") {
            return 10;
        }

        const raw = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
        const parsed = Number(raw);

        if (
            AUTO_REFRESH_OPTIONS.includes(
                parsed as (typeof AUTO_REFRESH_OPTIONS)[number],
            )
        ) {
            return parsed;
        }

        return 10;
    }

    function restartAutoRefreshTimer() {
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }

        autoRefreshTimer = setInterval(() => {
            void loadAll({
                showLoader: false,
                notifyOnError: false,
            });
        }, autoRefreshSeconds * 1000);
    }

    function setAutoRefreshSeconds(value: number) {
        if (
            !AUTO_REFRESH_OPTIONS.includes(
                value as (typeof AUTO_REFRESH_OPTIONS)[number],
            )
        ) {
            return;
        }

        autoRefreshSeconds = value;
        restartAutoRefreshTimer();

        if (typeof window !== "undefined") {
            window.localStorage.setItem(
                AUTO_REFRESH_STORAGE_KEY,
                String(value),
            );
        }
    }
</script>

<main class="flex min-h-screen w-full flex-col gap-3 p-3 md:p-4">
    <section class="flex flex-wrap items-start justify-between gap-3">
        <div>
            <h1 class="text-2xl font-semibold">Notify Guard</h1>
            <p class="text-muted-foreground text-sm">
                {$_("app.subtitle")}
            </p>
        </div>

        <div class="flex items-center gap-3">
            <div class="flex items-center gap-1">
                <span class="text-muted-foreground text-xs"
                    >{$_("app.language")}</span
                >
                <Button
                    variant={$appLocaleStore === "en" ? "default" : "outline"}
                    size="sm"
                    onclick={() => setLanguage("en")}
                >
                    🇬🇧 EN
                </Button>
                <Button
                    variant={$appLocaleStore === "uk" ? "default" : "outline"}
                    size="sm"
                    onclick={() => setLanguage("uk")}
                >
                    🇺🇦 UA
                </Button>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-muted-foreground text-xs">🌙</span>
                <Switch
                    checked={$isDarkThemeStore}
                    onCheckedChange={(checked) => toggleTheme(Boolean(checked))}
                />
            </div>
        </div>
    </section>

    <section
        class="bg-background/10 sticky top-0 z-40 rounded-lg border p-2 shadow-sm backdrop-blur-md transition-all duration-200"
    >
        <div class="flex flex-wrap items-center gap-2">
            <span
                class="text-muted-foreground px-2 text-xs uppercase tracking-wide"
                >{$_("app.sections")}</span
            >
            <div class="flex flex-wrap items-center gap-2" role="tablist">
                <Button
                    role="tab"
                    aria-selected={activeTab === "devices"}
                    variant={activeTab === "devices" ? "default" : "outline"}
                    onclick={() => (activeTab = "devices")}
                >
                    {$_("app.tabs.devices")}
                </Button>
                <Button
                    role="tab"
                    aria-selected={activeTab === "bots"}
                    variant={activeTab === "bots" ? "default" : "outline"}
                    onclick={() => (activeTab = "bots")}
                >
                    {$_("app.tabs.bots")}
                </Button>
                <Button
                    role="tab"
                    aria-selected={activeTab === "rest"}
                    variant={activeTab === "rest" ? "default" : "outline"}
                    onclick={() => (activeTab = "rest")}
                >
                    {$_("app.tabs.rest")}
                </Button>
                <Button
                    role="tab"
                    aria-selected={activeTab === "logs"}
                    variant={activeTab === "logs" ? "default" : "outline"}
                    onclick={() => (activeTab = "logs")}
                >
                    {$_("app.tabs.logs")}
                </Button>
            </div>
        </div>
    </section>

    {#if activeTab === "devices"}
        <section class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="flex items-center justify-between gap-2 px-1">
                <h2 class="text-muted-foreground text-sm font-medium">
                    {$_("app.tabs.devices")}
                </h2>
                <div class="flex items-center gap-2">
                    <span class="text-muted-foreground text-xs"
                        >{$_("app.autoRefresh")}</span
                    >
                    <div class="flex items-center gap-1">
                        {#each AUTO_REFRESH_OPTIONS as option}
                            <Button
                                size="sm"
                                variant={autoRefreshSeconds === option
                                    ? "default"
                                    : "outline"}
                                onclick={() => setAutoRefreshSeconds(option)}
                            >
                                {option}s
                            </Button>
                        {/each}
                    </div>
                    <Button
                        variant="secondary"
                        onclick={loadAll}
                        disabled={isLoading}>{$_("app.refresh")}</Button
                    >
                </div>
            </div>

            <DevicesFeature
                {settings}
                {isSyncing}
                deviceSearchQuery={$deviceSearchQueryStore}
                onlyModbus={$onlyModbusStore}
                {sortedDevices}
                {bots}
                {saveNetboxSettings}
                {syncNetbox}
                {setDeviceSearchQuery}
                {toggleOnlyModbus}
                {resetDeviceFilters}
                {toggleDeviceSort}
                {sortIndicator}
                {openDeviceHistory}
                {updateDevice}
                {toggleAssignedBot}
                {statusVariant}
                {statusLabel}
            />
        </section>
    {/if}

    {#if activeTab === "bots"}
        <section class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="flex items-center justify-between gap-2 px-1">
                <h2 class="text-muted-foreground text-sm font-medium">
                    {$_("app.tabs.bots")}
                </h2>
                <div class="flex items-center gap-2">
                    <span class="text-muted-foreground text-xs"
                        >{$_("app.autoRefresh")}</span
                    >
                    <div class="flex items-center gap-1">
                        {#each AUTO_REFRESH_OPTIONS as option}
                            <Button
                                size="sm"
                                variant={autoRefreshSeconds === option
                                    ? "default"
                                    : "outline"}
                                onclick={() => setAutoRefreshSeconds(option)}
                            >
                                {option}s
                            </Button>
                        {/each}
                    </div>
                    <Button
                        variant="secondary"
                        onclick={loadAll}
                        disabled={isLoading}>{$_("app.refresh")}</Button
                    >
                </div>
            </div>

            <BotsFeature
                {bots}
                {newBotName}
                {newBotToken}
                setNewBotName={(value) => (newBotName = value)}
                setNewBotToken={(value) => (newBotToken = value)}
                {createBot}
                {openBotSettings}
                {deleteBot}
            />
        </section>
    {/if}

    {#if activeTab === "logs"}
        <section class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="flex items-center justify-between gap-2 px-1">
                <h2 class="text-muted-foreground text-sm font-medium">
                    {$_("app.tabs.logs")}
                </h2>
                <div class="flex items-center gap-2">
                    <span class="text-muted-foreground text-xs"
                        >{$_("app.autoRefresh")}</span
                    >
                    <div class="flex items-center gap-1">
                        {#each AUTO_REFRESH_OPTIONS as option}
                            <Button
                                size="sm"
                                variant={autoRefreshSeconds === option
                                    ? "default"
                                    : "outline"}
                                onclick={() => setAutoRefreshSeconds(option)}
                            >
                                {option}s
                            </Button>
                        {/each}
                    </div>
                    <Button
                        variant="secondary"
                        onclick={loadAll}
                        disabled={isLoading}>{$_("app.refresh")}</Button
                    >
                </div>
            </div>

            <LogsFeature {logs} {appLogs} />
        </section>
    {/if}

    {#if activeTab === "rest"}
        <section class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="flex items-center justify-between gap-2 px-1">
                <h2 class="text-muted-foreground text-sm font-medium">
                    {$_("app.tabs.rest")}
                </h2>
                <div class="flex items-center gap-2">
                    <span class="text-muted-foreground text-xs"
                        >{$_("app.autoRefresh")}</span
                    >
                    <div class="flex items-center gap-1">
                        {#each AUTO_REFRESH_OPTIONS as option}
                            <Button
                                size="sm"
                                variant={autoRefreshSeconds === option
                                    ? "default"
                                    : "outline"}
                                onclick={() => setAutoRefreshSeconds(option)}
                            >
                                {option}s
                            </Button>
                        {/each}
                    </div>
                    <Button
                        variant="secondary"
                        onclick={loadAll}
                        disabled={isLoading}>{$_("app.refresh")}</Button
                    >
                </div>
            </div>

            <RestInboundFeature {logs} />
        </section>
    {/if}

    <BotSettingsDialog
        bind:open={isBotDialogOpen}
        bot={selectedBotForSettings}
        onDataChanged={loadAll}
        onNotify={pushToast}
    />

    <DeviceHistoryDialog
        bind:open={isHistoryDialogOpen}
        device={selectedDeviceForHistory}
        onNotify={pushToast}
    />

    <div
        class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
        {#each $toastsStore as toast (toast.id)}
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
