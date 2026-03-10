<script lang="ts">
    import { get } from "svelte/store";
    import { _ } from "svelte-i18n";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Table from "$lib/components/ui/table/index.js";
    import type { Bot, Device } from "$lib/api/types";
    import {
        fetchDeviceBotChatTargets,
        updateDeviceBotChatTarget,
    } from "$lib/services/app-data";

    type DeviceBotChatTarget = {
        id: number;
        chatId: string;
        name: string;
        pingEnabled: boolean;
        portEnabled: boolean;
    };

    let {
        open = $bindable(false),
        device,
        bot,
        onNotify,
    }: {
        open?: boolean;
        device: Device | null;
        bot: Bot | null;
        onNotify: (message: string, kind: "success" | "error") => void;
    } = $props();

    let isLoading = $state(false);
    let rows = $state<DeviceBotChatTarget[]>([]);
    let openedKey = $state("");

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

    $effect(() => {
        if (!open || !device || !bot) {
            return;
        }

        const key = `${device.id}:${bot.id}`;
        if (openedKey === key) {
            return;
        }

        openedKey = key;
        void loadTargets(device.id, bot.id);
    });

    $effect(() => {
        if (!open) {
            openedKey = "";
            rows = [];
            isLoading = false;
        }
    });

    async function loadTargets(deviceId: number, botId: number) {
        isLoading = true;
        rows = [];

        try {
            const response = await fetchDeviceBotChatTargets(deviceId, botId);
            rows = response.chats;
        } catch (error) {
            onNotify(toError(error), "error");
            open = false;
        } finally {
            isLoading = false;
        }
    }

    async function updateTarget(
        chatId: number,
        patch: Partial<
            Pick<DeviceBotChatTarget, "pingEnabled" | "portEnabled">
        >,
    ) {
        if (!device || !bot) {
            return;
        }

        const row = rows.find((item) => item.id === chatId);
        if (!row) {
            return;
        }

        const next = {
            pingEnabled: patch.pingEnabled ?? row.pingEnabled,
            portEnabled: patch.portEnabled ?? row.portEnabled,
        };

        rows = rows.map((item) =>
            item.id === chatId ? { ...item, ...next } : item,
        );

        try {
            await updateDeviceBotChatTarget(device.id, bot.id, chatId, next);
        } catch (error) {
            rows = rows.map((item) => (item.id === chatId ? row : item));
            onNotify(toError(error), "error");
        }
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-2xl">
        <Dialog.Header>
            <Dialog.Title>{$_("devices.botChatsDialog.title")}</Dialog.Title>
            <Dialog.Description>
                {#if device && bot}
                    {$_("devices.botChatsDialog.subtitle", {
                        values: { device: device.name, bot: bot.name },
                    })}
                {/if}
            </Dialog.Description>
        </Dialog.Header>

        {#if isLoading}
            <div class="text-muted-foreground py-4 text-sm">
                {$_("devices.botChatsDialog.loading")}
            </div>
        {:else if rows.length === 0}
            <div class="text-muted-foreground py-4 text-sm">
                {$_("devices.botChatsDialog.empty")}
            </div>
        {:else}
            <div class="max-h-[50vh] overflow-auto rounded-md border">
                <Table.Root>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head
                                >{$_(
                                    "devices.botChatsDialog.table.chat",
                                )}</Table.Head
                            >
                            <Table.Head
                                >{$_(
                                    "devices.botChatsDialog.table.chatId",
                                )}</Table.Head
                            >
                            <Table.Head
                                >{$_(
                                    "devices.botChatsDialog.table.ping",
                                )}</Table.Head
                            >
                            <Table.Head
                                >{$_(
                                    "devices.botChatsDialog.table.ports",
                                )}</Table.Head
                            >
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each rows as row (row.id)}
                            <Table.Row>
                                <Table.Cell>{row.name}</Table.Cell>
                                <Table.Cell>{row.chatId}</Table.Cell>
                                <Table.Cell>
                                    <Switch
                                        checked={row.pingEnabled}
                                        onCheckedChange={(checked) =>
                                            updateTarget(row.id, {
                                                pingEnabled: Boolean(checked),
                                            })}
                                    />
                                </Table.Cell>
                                <Table.Cell>
                                    <Switch
                                        checked={row.portEnabled}
                                        onCheckedChange={(checked) =>
                                            updateTarget(row.id, {
                                                portEnabled: Boolean(checked),
                                            })}
                                    />
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </div>
        {/if}

        <div class="text-muted-foreground pt-2 text-xs">
            {t("devices.botChatsDialog.hint")}
        </div>
    </Dialog.Content>
</Dialog.Root>
