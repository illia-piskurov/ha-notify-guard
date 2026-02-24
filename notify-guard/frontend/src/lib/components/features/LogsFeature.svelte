<script lang="ts">
    import { Badge } from "$lib/components/ui/badge/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import * as Table from "$lib/components/ui/table/index.js";
    import { _ } from "svelte-i18n";
    import type { AppLogEntry, NotificationLogEntry } from "$lib/api/types";

    let {
        logs,
        appLogs,
    }: {
        logs: NotificationLogEntry[];
        appLogs: AppLogEntry[];
    } = $props();

    type SortDirection = "asc" | "desc";
    type DeliverySortKey = "created" | "status" | "message";
    type AppSortKey = "created" | "level" | "scope" | "message";

    let deliverySearchQuery = $state("");
    let appSearchQuery = $state("");

    let deliverySortKey = $state<DeliverySortKey>("created");
    let deliverySortDirection = $state<SortDirection>("desc");

    let appSortKey = $state<AppSortKey>("created");
    let appSortDirection = $state<SortDirection>("desc");

    const DELIVERY_PAGE_SIZE = 10;
    let deliveryPage = $state(1);

    let appDeliveryLogs = $derived(
        logs.filter((row) => !row.source.startsWith("rest")),
    );

    let filteredDeliveryLogs = $derived.by(() => {
        const query = deliverySearchQuery.trim().toLowerCase();
        if (!query) {
            return appDeliveryLogs;
        }

        return appDeliveryLogs.filter((row) =>
            [row.message, row.last_error ?? "", row.idempotency_key ?? ""]
                .join(" ")
                .toLowerCase()
                .includes(query),
        );
    });

    let sortedDeliveryLogs = $derived.by(() => {
        const directionFactor = deliverySortDirection === "asc" ? 1 : -1;

        return [...filteredDeliveryLogs].sort((left, right) => {
            if (deliverySortKey === "created") {
                return (
                    (toTimestamp(left.created_at) -
                        toTimestamp(right.created_at)) *
                    directionFactor
                );
            }

            if (deliverySortKey === "status") {
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

    let deliveryTotalPages = $derived(
        Math.max(1, Math.ceil(sortedDeliveryLogs.length / DELIVERY_PAGE_SIZE)),
    );

    let pagedDeliveryLogs = $derived.by(() => {
        const start = (deliveryPage - 1) * DELIVERY_PAGE_SIZE;
        return sortedDeliveryLogs.slice(start, start + DELIVERY_PAGE_SIZE);
    });

    let filteredAppLogs = $derived.by(() => {
        const query = appSearchQuery.trim().toLowerCase();
        if (!query) {
            return appLogs;
        }

        return appLogs.filter((row) =>
            [
                row.message,
                row.scope ?? "",
                row.path ?? "",
                String(row.status ?? ""),
            ]
                .join(" ")
                .toLowerCase()
                .includes(query),
        );
    });

    let sortedAppLogs = $derived.by(() => {
        const directionFactor = appSortDirection === "asc" ? 1 : -1;

        return [...filteredAppLogs].sort((left, right) => {
            if (appSortKey === "created") {
                return (
                    (toTimestamp(left.created_at) -
                        toTimestamp(right.created_at)) *
                    directionFactor
                );
            }

            if (appSortKey === "level") {
                return (
                    left.level.localeCompare(right.level, undefined, {
                        sensitivity: "base",
                    }) * directionFactor
                );
            }

            if (appSortKey === "scope") {
                return (
                    (left.scope ?? "").localeCompare(
                        right.scope ?? "",
                        undefined,
                        {
                            sensitivity: "base",
                        },
                    ) * directionFactor
                );
            }

            return (
                left.message.localeCompare(right.message, undefined, {
                    sensitivity: "base",
                }) * directionFactor
            );
        });
    });

    let latestAppLogs = $derived(sortedAppLogs.slice(0, 10));

    $effect(() => {
        const maxPages = deliveryTotalPages;
        if (deliveryPage > maxPages) {
            deliveryPage = maxPages;
        }
    });

    $effect(() => {
        deliverySearchQuery;
        deliverySortKey;
        deliverySortDirection;
        deliveryPage = 1;
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

    function isErrorLevel(level: string): boolean {
        return level.toLowerCase() === "error";
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

    function toggleDeliverySort(key: DeliverySortKey) {
        if (deliverySortKey === key) {
            deliverySortDirection =
                deliverySortDirection === "asc" ? "desc" : "asc";
            return;
        }

        deliverySortKey = key;
        deliverySortDirection = key === "created" ? "desc" : "asc";
    }

    function deliverySortIndicator(key: DeliverySortKey): string {
        if (deliverySortKey !== key) {
            return "↕";
        }

        return deliverySortDirection === "asc" ? "↑" : "↓";
    }

    function toggleAppSort(key: AppSortKey) {
        if (appSortKey === key) {
            appSortDirection = appSortDirection === "asc" ? "desc" : "asc";
            return;
        }

        appSortKey = key;
        appSortDirection = key === "created" ? "desc" : "asc";
    }

    function appSortIndicator(key: AppSortKey): string {
        if (appSortKey !== key) {
            return "↕";
        }

        return appSortDirection === "asc" ? "↑" : "↓";
    }

    function goToPreviousDeliveryPage() {
        deliveryPage = Math.max(1, deliveryPage - 1);
    }

    function goToNextDeliveryPage() {
        deliveryPage = Math.min(deliveryTotalPages, deliveryPage + 1);
    }

    function formatLogLine(row: AppLogEntry): string {
        const created = row.created_at ?? "-";
        const level = row.level.toUpperCase();
        const scope = row.scope || "-";
        const method = row.method || "-";
        const path = row.path || "-";
        const status = row.status === null ? "-" : String(row.status);
        const details = row.details || "";

        return `[${created}] [${level}] [${scope}] ${row.message} | ${method} ${path} | status=${status}${details ? ` | details=${details}` : ""}`;
    }

    function downloadAppLogsAsText() {
        const orderedRows = [...appLogs].sort(
            (left, right) =>
                toTimestamp(right.created_at) - toTimestamp(left.created_at),
        );

        const content = orderedRows.map(formatLogLine).join("\n");
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const anchor = document.createElement("a");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        anchor.href = url;
        anchor.download = `notify-guard-app-logs-${timestamp}.txt`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }
</script>

<section class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="rounded-lg border p-4">
        <h2 class="text-lg font-medium">{$_("logs.delivery.title")}</h2>
        <p class="text-muted-foreground mt-1 text-sm">
            {$_("logs.delivery.subtitle")}
        </p>

        <div class="mt-3">
            <input
                class="bg-background border-input w-full max-w-md rounded-md border px-3 py-2 text-sm"
                value={deliverySearchQuery}
                oninput={(event) =>
                    (deliverySearchQuery = (
                        event.currentTarget as HTMLInputElement
                    ).value)}
                placeholder={$_("logs.delivery.searchPlaceholder")}
            />
        </div>

        <div class="mt-3 overflow-auto">
            <Table.Root>
                <Table.Header>
                    <Table.Row>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleDeliverySort("created")}
                                type="button"
                            >
                                {$_("logs.delivery.table.created")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{deliverySortIndicator("created")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleDeliverySort("status")}
                                type="button"
                            >
                                {$_("logs.delivery.table.status")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{deliverySortIndicator("status")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleDeliverySort("message")}
                                type="button"
                            >
                                {$_("logs.delivery.table.message")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{deliverySortIndicator("message")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head
                            >{$_("logs.delivery.table.attempts")}</Table.Head
                        >
                        <Table.Head
                            >{$_("logs.delivery.table.idempotency")}</Table.Head
                        >
                        <Table.Head
                            >{$_("logs.delivery.table.error")}</Table.Head
                        >
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#if pagedDeliveryLogs.length === 0}
                        <Table.Row>
                            <Table.Cell
                                colspan={6}
                                class="text-muted-foreground py-5 text-center"
                            >
                                {$_("logs.delivery.empty")}
                            </Table.Cell>
                        </Table.Row>
                    {/if}

                    {#each pagedDeliveryLogs as row (row.id)}
                        <Table.Row>
                            <Table.Cell>{formatDate(row.created_at)}</Table.Cell
                            >
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
                            <Table.Cell>{row.attempts}</Table.Cell>
                            <Table.Cell>{row.idempotency_key ?? "—"}</Table.Cell
                            >
                            <Table.Cell class="max-w-[320px] truncate"
                                >{row.last_error ?? "—"}</Table.Cell
                            >
                        </Table.Row>
                    {/each}
                </Table.Body>
            </Table.Root>
        </div>

        {#if sortedDeliveryLogs.length > 0}
            <div class="mt-3 flex items-center justify-between gap-2">
                <div class="text-muted-foreground text-xs">
                    {$_("logs.delivery.pagination.page", {
                        values: {
                            current: deliveryPage,
                            total: deliveryTotalPages,
                        },
                    })}
                </div>
                <div class="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onclick={goToPreviousDeliveryPage}
                        disabled={deliveryPage <= 1}
                    >
                        {$_("logs.delivery.pagination.prev")}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onclick={goToNextDeliveryPage}
                        disabled={deliveryPage >= deliveryTotalPages}
                    >
                        {$_("logs.delivery.pagination.next")}
                    </Button>
                </div>
            </div>
        {/if}
    </div>

    <div class="rounded-lg border p-4">
        <div class="flex items-center justify-between gap-2">
            <h2 class="text-lg font-medium">{$_("logs.app.title")}</h2>
            <Button size="sm" variant="outline" onclick={downloadAppLogsAsText}
                >{$_("logs.app.download")}</Button
            >
        </div>
        <p class="text-muted-foreground mt-1 text-sm">
            {$_("logs.app.subtitle")}
        </p>
        <p class="text-muted-foreground mt-1 text-xs">
            {$_("logs.app.lastTen")}
        </p>

        <div class="mt-3">
            <input
                class="bg-background border-input w-full max-w-md rounded-md border px-3 py-2 text-sm"
                value={appSearchQuery}
                oninput={(event) =>
                    (appSearchQuery = (event.currentTarget as HTMLInputElement)
                        .value)}
                placeholder={$_("logs.app.searchPlaceholder")}
            />
        </div>

        <div class="mt-3 overflow-auto">
            <Table.Root>
                <Table.Header>
                    <Table.Row>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleAppSort("created")}
                                type="button"
                            >
                                {$_("logs.app.table.created")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{appSortIndicator("created")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleAppSort("level")}
                                type="button"
                            >
                                {$_("logs.app.table.level")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{appSortIndicator("level")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleAppSort("scope")}
                                type="button"
                            >
                                {$_("logs.app.table.scope")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{appSortIndicator("scope")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>
                            <button
                                class="hover:text-foreground/80 inline-flex items-center gap-1"
                                onclick={() => toggleAppSort("message")}
                                type="button"
                            >
                                {$_("logs.app.table.message")}
                                <span
                                    class="text-foreground text-sm font-semibold leading-none"
                                    >{appSortIndicator("message")}</span
                                >
                            </button>
                        </Table.Head>
                        <Table.Head>{$_("logs.app.table.status")}</Table.Head>
                        <Table.Head>{$_("logs.app.table.path")}</Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#if latestAppLogs.length === 0}
                        <Table.Row>
                            <Table.Cell
                                colspan={6}
                                class="text-muted-foreground py-5 text-center"
                            >
                                {$_("logs.app.empty")}
                            </Table.Cell>
                        </Table.Row>
                    {/if}

                    {#each latestAppLogs as row (row.id)}
                        <Table.Row>
                            <Table.Cell>{formatDate(row.created_at)}</Table.Cell
                            >
                            <Table.Cell>
                                <Badge
                                    variant={isErrorLevel(row.level)
                                        ? "destructive"
                                        : "outline"}
                                >
                                    {row.level}
                                </Badge>
                            </Table.Cell>
                            <Table.Cell>{row.scope ?? "—"}</Table.Cell>
                            <Table.Cell class="max-w-[360px] truncate"
                                >{row.message}</Table.Cell
                            >
                            <Table.Cell>{row.status ?? "—"}</Table.Cell>
                            <Table.Cell class="max-w-[280px] truncate"
                                >{row.path ?? "—"}</Table.Cell
                            >
                        </Table.Row>
                    {/each}
                </Table.Body>
            </Table.Root>
        </div>
    </div>
</section>
