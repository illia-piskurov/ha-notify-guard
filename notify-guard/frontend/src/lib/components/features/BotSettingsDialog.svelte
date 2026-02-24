<script lang="ts">
    import { get } from "svelte/store";
    import { _ } from "svelte-i18n";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Switch } from "$lib/components/ui/switch/index.js";
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Table from "$lib/components/ui/table/index.js";
    import { api } from "$lib/api/client";
    import type { Bot, BotChat } from "$lib/api/types";

    let {
        open = $bindable(false),
        bot,
        onDataChanged,
        onNotify,
    }: {
        open?: boolean;
        bot: Bot | null;
        onDataChanged: () => void | Promise<void>;
        onNotify: (message: string, kind: "success" | "error") => void;
    } = $props();

    let isLoading = $state(false);
    let botSettingsId = $state<number | null>(null);
    let botSettingsName = $state("");
    let botChats = $state<BotChat[]>([]);
    let newChatId = $state("");

    let openedForBotId = $state<number | null>(null);

    $effect(() => {
        if (!open || !bot) {
            return;
        }

        if (openedForBotId === bot.id) {
            return;
        }

        openedForBotId = bot.id;
        void loadBotSettings(bot.id, bot.name);
    });

    $effect(() => {
        if (!open) {
            openedForBotId = null;
            botSettingsId = null;
            botSettingsName = "";
            botChats = [];
            newChatId = "";
            isLoading = false;
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

    async function loadBotSettings(id: number, name: string) {
        isLoading = true;
        botSettingsId = id;
        botSettingsName = name;
        botChats = [];
        newChatId = "";

        try {
            const response = await api<{
                bot: {
                    id: number;
                    name: string;
                    token: string;
                };
                chats: BotChat[];
            }>(`/api/bots/${id}`);

            botSettingsName = response.bot.name;
            botChats = response.chats;
        } catch (error) {
            onNotify(toError(error), "error");
            open = false;
        } finally {
            isLoading = false;
        }
    }

    async function addBotChat() {
        if (botSettingsId === null) {
            return;
        }

        if (!newChatId.trim()) {
            onNotify(t("bots.validation.chatIdRequired"), "error");
            return;
        }

        try {
            const response = await api<{ success: boolean; chat: BotChat }>(
                `/api/bots/${botSettingsId}/chats`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        chatId: newChatId,
                        isActive: true,
                    }),
                },
            );

            botChats = [response.chat, ...botChats];
            newChatId = "";
            await onDataChanged();
        } catch (error) {
            onNotify(toError(error), "error");
        }
    }

    async function toggleBotChat(chat: BotChat, isActive: boolean) {
        try {
            await api<{ success: boolean }>(`/api/bot-chats/${chat.id}`, {
                method: "PATCH",
                body: JSON.stringify({ isActive }),
            });

            botChats = botChats.map((item) =>
                item.id === chat.id ? { ...item, isActive } : item,
            );
            await onDataChanged();
        } catch (error) {
            onNotify(toError(error), "error");
        }
    }

    async function deleteBotChat(chatId: number) {
        try {
            await api<{ success: boolean }>(`/api/bot-chats/${chatId}`, {
                method: "DELETE",
            });

            botChats = botChats.filter((chat) => chat.id !== chatId);
            await onDataChanged();
        } catch (error) {
            onNotify(toError(error), "error");
        }
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-2xl">
        <Dialog.Header>
            <Dialog.Title>{$_("bots.settingsTitle")}</Dialog.Title>
            <Dialog.Description>
                {botSettingsName}
            </Dialog.Description>
        </Dialog.Header>

        {#if isLoading}
            <div class="text-muted-foreground py-3 text-sm">
                {$_("bots.loading")}
            </div>
        {:else}
            <div class="grid gap-3">
                <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input
                        class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                        placeholder={$_("bots.chatIdPlaceholder")}
                        bind:value={newChatId}
                    />
                    <Button onclick={addBotChat}>{$_("bots.addChat")}</Button>
                </div>

                {#if botChats.length === 0}
                    <div class="text-muted-foreground text-sm">
                        {$_("bots.noChats")}
                    </div>
                {:else}
                    <div class="max-h-[45vh] overflow-auto rounded-md border">
                        <Table.Root>
                            <Table.Header>
                                <Table.Row>
                                    <Table.Head>Chat ID</Table.Head>
                                    <Table.Head
                                        >{$_("bots.mailingActive")}</Table.Head
                                    >
                                    <Table.Head
                                        >{$_("bots.table.action")}</Table.Head
                                    >
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {#each botChats as chat (chat.id)}
                                    <Table.Row>
                                        <Table.Cell>{chat.chatId}</Table.Cell>
                                        <Table.Cell>
                                            <Switch
                                                checked={chat.isActive}
                                                onCheckedChange={(checked) =>
                                                    toggleBotChat(
                                                        chat,
                                                        Boolean(checked),
                                                    )}
                                            />
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onclick={() =>
                                                    deleteBotChat(chat.id)}
                                            >
                                                {$_("bots.delete")}
                                            </Button>
                                        </Table.Cell>
                                    </Table.Row>
                                {/each}
                            </Table.Body>
                        </Table.Root>
                    </div>
                {/if}
            </div>
        {/if}
    </Dialog.Content>
</Dialog.Root>
