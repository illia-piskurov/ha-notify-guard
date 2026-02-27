<script lang="ts">
    import { Badge } from "$lib/components/ui/badge/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Checkbox } from "$lib/components/ui/checkbox/index.js";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import * as Table from "$lib/components/ui/table/index.js";
    import { _ } from "svelte-i18n";
    import type { Bot, Device, NetboxSettings } from "$lib/api/types";

    type DeviceSortKey = "name" | "ip" | "ping" | "bots";

    let {
        settings,
        isSyncing,
        deviceSearchQuery,
        onlyModbus,
        sortedDevices,
        bots,
        saveNetboxSettings,
        syncNetbox,
        setDeviceSearchQuery,
        toggleOnlyModbus,
        resetDeviceFilters,
        toggleDeviceSort,
        sortIndicator,
        openDeviceHistory,
        updateDevice,
        toggleAssignedBot,
        statusVariant,
        statusLabel,
    }: {
        settings: NetboxSettings;
        isSyncing: boolean;
        deviceSearchQuery: string;
        onlyModbus: boolean;
        sortedDevices: Device[];
        bots: Bot[];
        saveNetboxSettings: () => void | Promise<void>;
        syncNetbox: () => void | Promise<void>;
        setDeviceSearchQuery: (value: string) => void;
        toggleOnlyModbus: () => void;
        resetDeviceFilters: () => void;
        toggleDeviceSort: (key: DeviceSortKey) => void;
        sortIndicator: (key: DeviceSortKey) => string;
        openDeviceHistory: (device: Device) => void | Promise<void>;
        updateDevice: (
            deviceId: number,
            patch: Partial<Pick<Device, "monitorPing" | "assignedBotIds">>,
        ) => void | Promise<void>;
        toggleAssignedBot: (
            device: Device,
            botId: number,
            checked: boolean,
        ) => void;
        statusVariant: (
            status: string,
        ) => "default" | "secondary" | "destructive" | "outline";
        statusLabel: (kind: "ping" | "modbus", status: string) => string | null;
    } = $props();

    let allPingChecked = $derived(
        sortedDevices.length > 0 && sortedDevices.every((d) => d.monitorPing),
    );

    async function toggleAllPing(checked: boolean) {
        const updates = sortedDevices.map((device) =>
            updateDevice(device.id, { monitorPing: checked }),
        );
        await Promise.all(updates);
    }
</script>

<section class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="rounded-lg border p-4">
        <h2 class="text-lg font-medium">{$_("netbox.title")}</h2>
        <div class="mt-3 grid gap-3 lg:grid-cols-3">
            <div class="space-y-2">
                <label class="text-sm font-medium" for="netbox-url"
                    >{$_("netbox.apiUrl")}</label
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
                    >{$_("netbox.token")}</label
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
                    >{$_("netbox.interval")}</label
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
            <Button onclick={saveNetboxSettings}>{$_("netbox.save")}</Button>
            <Button
                variant="secondary"
                onclick={syncNetbox}
                disabled={isSyncing}
            >
                {isSyncing ? $_("netbox.syncing") : $_("netbox.sync")}
            </Button>
        </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col rounded-lg border">
        <div class="flex flex-wrap items-center justify-between gap-2 p-2 pb-0">
            <input
                class="bg-background border-input w-full max-w-md rounded-md border px-3 py-2 text-sm"
                placeholder={$_("devices.searchPlaceholder")}
                value={deviceSearchQuery}
                oninput={(event) =>
                    setDeviceSearchQuery(
                        (event.currentTarget as HTMLInputElement).value,
                    )}
            />

            <div class="flex items-center gap-2">
                <Button
                    variant={onlyModbus ? "default" : "outline"}
                    onclick={toggleOnlyModbus}
                >
                    {$_("devices.onlyModbus")}
                </Button>
                <Button variant="outline" onclick={resetDeviceFilters}>
                    {$_("devices.resetFilters")}
                </Button>
            </div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-2">
            <Table.Root class="text-sm">
                <Table.Header>
                    <Table.Row>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleDeviceSort("name")}
                                type="button"
                            >
                                {$_("devices.table.device")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{sortIndicator("name")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleDeviceSort("ip")}
                                type="button"
                            >
                                IP
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{sortIndicator("ip")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            <div class="flex items-center gap-2">
                                <button
                                    class="hover:text-foreground/80 inline-flex items-center gap-1"
                                    onclick={() => toggleDeviceSort("ping")}
                                    type="button"
                                >
                                    Ping
                                    <span
                                        class="text-foreground text-sm font-semibold leading-none"
                                        >{sortIndicator("ping")}</span
                                    >
                                </button>
                                {#if sortedDevices.length > 0}
                                    <Switch
                                        checked={allPingChecked}
                                        onCheckedChange={(checked) =>
                                            toggleAllPing(Boolean(checked))}
                                    />
                                {/if}
                            </div>
                        </Table.Head>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleDeviceSort("bots")}
                                type="button"
                            >
                                {$_("devices.table.bots")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{sortIndicator("bots")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            {$_("devices.table.status")}
                        </Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#each sortedDevices as device (device.id)}
                        <Table.Row>
                            <Table.Cell>
                                <div
                                    class="flex max-w-fit cursor-pointer items-center gap-1"
                                >
                                    <button
                                        class="text-primary hover:underline"
                                        onclick={() =>
                                            openDeviceHistory(device)}
                                        type="button"
                                    >
                                        {device.name}
                                    </button>
                                    {#if device.hasModbusTag}
                                        <Badge variant="secondary">modbus</Badge
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
                                            monitorPing: Boolean(checked),
                                        })}
                                />
                            </Table.Cell>
                            <Table.Cell>
                                <div class="flex flex-col gap-2">
                                    {#if bots.length === 0}
                                        <span
                                            class="text-muted-foreground text-xs"
                                        >
                                            {$_("devices.table.addBotHint")}
                                        </span>
                                    {/if}
                                    {#each bots as bot (bot.id)}
                                        <label
                                            class="flex items-center gap-2 text-xs"
                                        >
                                            <Checkbox
                                                checked={device.assignedBotIds.includes(
                                                    bot.id,
                                                )}
                                                onCheckedChange={(checked) =>
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

                                    {#if !statusLabel("ping", device.lastPingStatus)}
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
