<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.js";
    import { Checkbox } from "$lib/components/ui/checkbox/index.js";
    import * as Table from "$lib/components/ui/table/index.js";
    import { _ } from "svelte-i18n";
    import type { Bot, Chat } from "$lib/api/types";

    let {
        bots,
        chats,
        selectedBotId,
        assignedChatIds,
        isAssignmentsLoading,
        newBotName,
        newBotToken,
        newChatName,
        newChatId,
        setNewBotName,
        setNewBotToken,
        setNewChatName,
        setNewChatId,
        createBot,
        createChat,
        selectBot,
        toggleBotChatAssignment,
        deleteBot,
        deleteChat,
    }: {
        bots: Bot[];
        chats: Chat[];
        selectedBotId: number | null;
        assignedChatIds: number[];
        isAssignmentsLoading: boolean;
        newBotName: string;
        newBotToken: string;
        newChatName: string;
        newChatId: string;
        setNewBotName: (value: string) => void;
        setNewBotToken: (value: string) => void;
        setNewChatName: (value: string) => void;
        setNewChatId: (value: string) => void;
        createBot: () => void | Promise<void>;
        createChat: () => void | Promise<void>;
        selectBot: (bot: Bot) => void | Promise<void>;
        toggleBotChatAssignment: (
            botId: number,
            chatId: number,
            checked: boolean,
        ) => void | Promise<void>;
        deleteBot: (botId: number) => void | Promise<void>;
        deleteChat: (chatId: number) => void | Promise<void>;
    } = $props();
</script>

<section class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="grid gap-3 lg:grid-cols-2">
        <div class="rounded-lg border p-4">
            <h2 class="text-lg font-medium">{$_("bots.title")}</h2>

            <div class="mt-3 grid gap-3">
                <div class="space-y-2">
                    <label class="text-sm font-medium" for="bot-name"
                        >{$_("bots.name")}</label
                    >
                    <input
                        id="bot-name"
                        class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                        value={newBotName}
                        oninput={(event) =>
                            setNewBotName(
                                (event.currentTarget as HTMLInputElement).value,
                            )}
                        placeholder="Main Bot"
                    />
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-medium" for="bot-token"
                        >{$_("bots.token")}</label
                    >
                    <input
                        id="bot-token"
                        class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                        value={newBotToken}
                        oninput={(event) =>
                            setNewBotToken(
                                (event.currentTarget as HTMLInputElement).value,
                            )}
                        placeholder="123456:ABC..."
                    />
                </div>
            </div>

            <div class="mt-3">
                <Button onclick={createBot}>{$_("bots.add")}</Button>
            </div>
        </div>

        <div class="rounded-lg border p-4">
            <h2 class="text-lg font-medium">{$_("bots.chatsTitle")}</h2>

            <div class="mt-3 grid gap-3">
                <div class="space-y-2">
                    <label class="text-sm font-medium" for="chat-name"
                        >{$_("bots.chatName")}</label
                    >
                    <input
                        id="chat-name"
                        class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                        value={newChatName}
                        oninput={(event) =>
                            setNewChatName(
                                (event.currentTarget as HTMLInputElement).value,
                            )}
                        placeholder="Operations"
                    />
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-medium" for="chat-id"
                        >{$_("bots.chatId")}</label
                    >
                    <input
                        id="chat-id"
                        class="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
                        value={newChatId}
                        oninput={(event) =>
                            setNewChatId(
                                (event.currentTarget as HTMLInputElement).value,
                            )}
                        placeholder="-1001234567890"
                    />
                </div>
            </div>

            <div class="mt-3">
                <Button onclick={createChat}>{$_("bots.addChat")}</Button>
            </div>
        </div>
    </div>

    <div class="grid min-h-0 gap-3 lg:grid-cols-2">
        <div class="overflow-x-auto rounded-lg border p-2">
            <Table.Root>
                <Table.Header>
                    <Table.Row>
                        <Table.Head>{$_("bots.table.name")}</Table.Head>
                        <Table.Head>{$_("bots.table.chats")}</Table.Head>
                        <Table.Head>{$_("bots.table.activeChats")}</Table.Head>
                        <Table.Head>{$_("bots.table.action")}</Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#if bots.length === 0}
                        <Table.Row>
                            <Table.Cell
                                colspan={4}
                                class="text-muted-foreground py-5 text-center"
                            >
                                {$_("bots.table.empty")}
                            </Table.Cell>
                        </Table.Row>
                    {/if}

                    {#each bots as bot (bot.id)}
                        <Table.Row
                            class={selectedBotId === bot.id
                                ? "bg-muted/40"
                                : undefined}
                        >
                            <Table.Cell>
                                <button
                                    class="hover:text-foreground/80 text-left font-medium underline-offset-2 hover:underline"
                                    onclick={() => selectBot(bot)}
                                    type="button"
                                >
                                    {bot.name}
                                </button>
                            </Table.Cell>
                            <Table.Cell>{bot.chatCount}</Table.Cell>
                            <Table.Cell>{bot.activeChatCount}</Table.Cell>
                            <Table.Cell>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onclick={() => deleteBot(bot.id)}
                                >
                                    {$_("bots.delete")}
                                </Button>
                            </Table.Cell>
                        </Table.Row>
                    {/each}
                </Table.Body>
            </Table.Root>
        </div>

        <div class="overflow-x-auto rounded-lg border p-2">
            <Table.Root>
                <Table.Header>
                    <Table.Row>
                        <Table.Head>{$_("bots.chatTable.enabled")}</Table.Head>
                        <Table.Head>{$_("bots.chatTable.name")}</Table.Head>
                        <Table.Head>{$_("bots.chatTable.chatId")}</Table.Head>
                        <Table.Head>{$_("bots.table.action")}</Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#if chats.length === 0}
                        <Table.Row>
                            <Table.Cell
                                colspan={4}
                                class="text-muted-foreground py-5 text-center"
                            >
                                {$_("bots.chatTable.empty")}
                            </Table.Cell>
                        </Table.Row>
                    {/if}

                    {#each chats as chat (chat.id)}
                        <Table.Row>
                            <Table.Cell>
                                <Checkbox
                                    disabled={selectedBotId === null ||
                                        isAssignmentsLoading}
                                    checked={selectedBotId !== null &&
                                        assignedChatIds.includes(chat.id)}
                                    onCheckedChange={(checked) => {
                                        if (selectedBotId === null) {
                                            return;
                                        }

                                        toggleBotChatAssignment(
                                            selectedBotId,
                                            chat.id,
                                            Boolean(checked),
                                        );
                                    }}
                                />
                            </Table.Cell>
                            <Table.Cell>{chat.name}</Table.Cell>
                            <Table.Cell>{chat.chatId}</Table.Cell>
                            <Table.Cell>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onclick={() => deleteChat(chat.id)}
                                >
                                    {$_("bots.delete")}
                                </Button>
                            </Table.Cell>
                        </Table.Row>
                    {/each}
                </Table.Body>
            </Table.Root>

            {#if selectedBotId === null}
                <div class="text-muted-foreground px-2 pt-2 text-xs">
                    {$_("bots.selectBotHint")}
                </div>
            {/if}
        </div>
    </div>
</section>
