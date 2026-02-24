<script lang="ts">
    import { Badge } from "$lib/components/ui/badge/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import * as Table from "$lib/components/ui/table/index.js";
    import { _ } from "svelte-i18n";
    import type { DeviceHistorySlice, HistoryPeriod } from "$lib/api/types";

    let {
        historyPeriod,
        changeHistoryPeriod,
        isHistoryLoading,
        historyDeviceExists,
        historySlices,
        historyMonitorPing,
        formatHistoryTime,
        formatDuration,
    }: {
        historyPeriod: HistoryPeriod;
        changeHistoryPeriod: (period: HistoryPeriod) => void | Promise<void>;
        isHistoryLoading: boolean;
        historyDeviceExists: boolean | null;
        historySlices: DeviceHistorySlice[];
        historyMonitorPing: boolean;
        formatHistoryTime: (value: string) => string;
        formatDuration: (startedAt: string, endedAt: string | null) => string;
    } = $props();
</script>

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
        {$_("history.periodAll")}
    </Button>
</div>

{#if isHistoryLoading}
    <div class="text-muted-foreground py-4 text-sm">
        {$_("history.loading")}
    </div>
{:else if historyDeviceExists === false}
    <div class="text-muted-foreground py-4 text-sm">
        {$_("history.deviceMissing")}
    </div>
{:else if historySlices.length === 0}
    <div class="text-muted-foreground py-4 text-sm">
        {$_("history.empty")}
        {#if !historyMonitorPing}
            <div class="mt-2">{$_("history.pingDisabledNow")}</div>
        {/if}
    </div>
{:else}
    <div class="max-h-[60vh] overflow-auto rounded-md border">
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head>{$_("history.table.from")}</Table.Head>
                    <Table.Head>{$_("history.table.to")}</Table.Head>
                    <Table.Head>{$_("history.table.status")}</Table.Head>
                    <Table.Head>{$_("history.table.duration")}</Table.Head>
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
                                {$_("history.now")}
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
                            {formatDuration(slice.startedAt, slice.endedAt)}
                        </Table.Cell>
                    </Table.Row>
                {/each}
            </Table.Body>
        </Table.Root>
    </div>
{/if}
