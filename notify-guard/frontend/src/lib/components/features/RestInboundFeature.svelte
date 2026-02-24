<script lang="ts">
    import { Badge } from "$lib/components/ui/badge/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Table from "$lib/components/ui/table/index.js";
    import { _ } from "svelte-i18n";
    import type { NotificationLogEntry } from "$lib/api/types";

    let {
        logs,
    }: {
        logs: NotificationLogEntry[];
    } = $props();

    let isRestDetailsOpen = $state(false);
    let selectedRestLog = $state<NotificationLogEntry | null>(null);
    let restSearchQuery = $state("");

    type RestSortKey = "created" | "source" | "status" | "message";
    type SortDirection = "asc" | "desc";

    let restSortKey = $state<RestSortKey>("created");
    let restSortDirection = $state<SortDirection>("desc");

    let restLogs = $derived(
        logs.filter((row) => row.source.startsWith("rest")),
    );

    let filteredRestLogs = $derived.by(() => {
        const query = restSearchQuery.trim().toLowerCase();
        if (!query) {
            return restLogs;
        }

        return restLogs.filter((row) =>
            row.message.toLowerCase().includes(query),
        );
    });

    let sortedRestLogs = $derived.by(() => {
        const directionFactor = restSortDirection === "asc" ? 1 : -1;

        return [...filteredRestLogs].sort((left, right) => {
            if (restSortKey === "created") {
                return (
                    (toTimestamp(left.created_at) -
                        toTimestamp(right.created_at)) *
                    directionFactor
                );
            }

            if (restSortKey === "source") {
                return (
                    left.source.localeCompare(right.source, undefined, {
                        sensitivity: "base",
                    }) * directionFactor
                );
            }

            if (restSortKey === "status") {
                return (
                    left.status.localeCompare(right.status, undefined, {
                        sensitivity: "base",
                    }) * directionFactor
                );
            }

            return (
                left.message.localeCompare(right.message, undefined, {
                    sensitivity: "base",
                }) * directionFactor
            );
        });
    });

    let selectedRestRelatedHistory = $derived.by(() => {
        const selectedLog = selectedRestLog;

        if (!selectedLog) {
            return [] as NotificationLogEntry[];
        }

        if (!selectedLog.idempotency_key) {
            return [selectedLog];
        }

        return logs
            .filter(
                (row) =>
                    row.idempotency_key === selectedLog.idempotency_key &&
                    row.source.startsWith("rest"),
            )
            .sort((left, right) => {
                const leftTime = Date.parse(left.created_at ?? "") || 0;
                const rightTime = Date.parse(right.created_at ?? "") || 0;
                return rightTime - leftTime;
            });
    });

    function formatDate(value: string | null): string {
        if (!value) {
            return "—";
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return value;
        }

        return parsed.toLocaleString();
    }

    function isLogErrorStatus(status: string): boolean {
        return status.toLowerCase() === "failed";
    }

    function toTimestamp(value: string | null): number {
        if (!value) {
            return 0;
        }

        return Date.parse(value) || 0;
    }

    function toggleRestSort(key: RestSortKey) {
        if (restSortKey === key) {
            restSortDirection = restSortDirection === "asc" ? "desc" : "asc";
            return;
        }

        restSortKey = key;
        restSortDirection = key === "created" ? "desc" : "asc";
    }

    function sortIndicator(key: RestSortKey): string {
        if (restSortKey !== key) {
            return "↕";
        }

        return restSortDirection === "asc" ? "↑" : "↓";
    }

    function openRestDetails(row: NotificationLogEntry) {
        selectedRestLog = row;
        isRestDetailsOpen = true;
    }
</script>

<section class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="rounded-lg border p-4">
        <h2 class="text-lg font-medium">{$_("logs.rest.title")}</h2>
        <p class="text-muted-foreground mt-1 text-sm">
            {$_("logs.rest.subtitle")}
        </p>

        <div class="mt-3">
            <input
                class="bg-background border-input w-full max-w-md rounded-md border px-3 py-2 text-sm"
                value={restSearchQuery}
                oninput={(event) =>
                    (restSearchQuery = (event.currentTarget as HTMLInputElement)
                        .value)}
                placeholder={$_("logs.rest.searchPlaceholder")}
            />
        </div>

        <div class="mt-3 overflow-auto">
            <Table.Root>
                <Table.Header>
                    <Table.Row>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleRestSort("created")}
                                type="button"
                            >
                                {$_("logs.rest.table.created")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{sortIndicator("created")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleRestSort("source")}
                                type="button"
                            >
                                {$_("logs.rest.table.source")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{sortIndicator("source")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleRestSort("status")}
                                type="button"
                            >
                                {$_("logs.rest.table.status")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{sortIndicator("status")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleRestSort("message")}
                                type="button"
                            >
                                {$_("logs.rest.table.message")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{sortIndicator("message")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head
                            >{$_("logs.rest.table.idempotency")}</Table.Head
                        >
                        <Table.Head>{$_("logs.rest.table.action")}</Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#if sortedRestLogs.length === 0}
                        <Table.Row>
                            <Table.Cell
                                colspan={6}
                                class="text-muted-foreground py-5 text-center"
                            >
                                {$_("logs.rest.empty")}
                            </Table.Cell>
                        </Table.Row>
                    {/if}

                    {#each sortedRestLogs as row (row.id)}
                        <Table.Row>
                            <Table.Cell>{formatDate(row.created_at)}</Table.Cell
                            >
                            <Table.Cell>{row.source}</Table.Cell>
                            <Table.Cell>
                                <Badge
                                    variant={isLogErrorStatus(row.status)
                                        ? "destructive"
                                        : "secondary"}
                                >
                                    {row.status}
                                </Badge>
                            </Table.Cell>
                            <Table.Cell class="max-w-[360px] truncate"
                                >{row.message}</Table.Cell
                            >
                            <Table.Cell>{row.idempotency_key ?? "—"}</Table.Cell
                            >
                            <Table.Cell>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onclick={() => openRestDetails(row)}
                                >
                                    {$_("logs.rest.table.view")}
                                </Button>
                            </Table.Cell>
                        </Table.Row>
                    {/each}
                </Table.Body>
            </Table.Root>
        </div>
    </div>

    <Dialog.Root bind:open={isRestDetailsOpen}>
        <Dialog.Content class="sm:max-w-3xl">
            <Dialog.Header>
                <Dialog.Title>{$_("logs.details.title")}</Dialog.Title>
                <Dialog.Description>
                    {selectedRestLog?.idempotency_key
                        ? selectedRestLog.idempotency_key
                        : $_("logs.details.noKey")}
                </Dialog.Description>
            </Dialog.Header>

            {#if selectedRestLog}
                <div class="space-y-3">
                    <div class="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                            <span class="text-muted-foreground"
                                >{$_("logs.details.source")}:</span
                            >
                            <span class="ml-2">{selectedRestLog.source}</span>
                        </div>
                        <div>
                            <span class="text-muted-foreground"
                                >{$_("logs.details.attempts")}:</span
                            >
                            <span class="ml-2">{selectedRestLog.attempts}</span>
                        </div>
                        <div class="sm:col-span-2">
                            <span class="text-muted-foreground"
                                >{$_("logs.details.message")}:</span
                            >
                            <span class="ml-2">{selectedRestLog.message}</span>
                        </div>
                    </div>

                    <div class="max-h-[45vh] overflow-auto rounded-md border">
                        <Table.Root>
                            <Table.Header>
                                <Table.Row>
                                    <Table.Head
                                        >{$_(
                                            "logs.details.table.created",
                                        )}</Table.Head
                                    >
                                    <Table.Head
                                        >{$_(
                                            "logs.details.table.status",
                                        )}</Table.Head
                                    >
                                    <Table.Head
                                        >{$_(
                                            "logs.details.table.attempts",
                                        )}</Table.Head
                                    >
                                    <Table.Head
                                        >{$_(
                                            "logs.details.table.sent",
                                        )}</Table.Head
                                    >
                                    <Table.Head
                                        >{$_(
                                            "logs.details.table.next",
                                        )}</Table.Head
                                    >
                                    <Table.Head
                                        >{$_(
                                            "logs.details.table.error",
                                        )}</Table.Head
                                    >
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {#each selectedRestRelatedHistory as row (row.id)}
                                    <Table.Row>
                                        <Table.Cell
                                            >{formatDate(
                                                row.created_at,
                                            )}</Table.Cell
                                        >
                                        <Table.Cell>
                                            <Badge
                                                variant={isLogErrorStatus(
                                                    row.status,
                                                )
                                                    ? "destructive"
                                                    : "secondary"}
                                            >
                                                {row.status}
                                            </Badge>
                                        </Table.Cell>
                                        <Table.Cell>{row.attempts}</Table.Cell>
                                        <Table.Cell
                                            >{formatDate(
                                                row.sent_at,
                                            )}</Table.Cell
                                        >
                                        <Table.Cell
                                            >{formatDate(
                                                row.next_attempt_at,
                                            )}</Table.Cell
                                        >
                                        <Table.Cell
                                            class="max-w-[260px] truncate"
                                            >{row.last_error ?? "—"}</Table.Cell
                                        >
                                    </Table.Row>
                                {/each}
                            </Table.Body>
                        </Table.Root>
                    </div>
                </div>
            {/if}
        </Dialog.Content>
    </Dialog.Root>
</section>
