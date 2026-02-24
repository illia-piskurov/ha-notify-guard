import { In } from 'typeorm';
import { dataSource } from '../db/data-source';
import { Setting } from '../db/entities';

export type NetboxSettings = {
    netbox_url: string;
    netbox_token: string;
    poll_seconds: number;
};

export async function getNetboxSettings(): Promise<NetboxSettings> {
    const settingRepo = dataSource.getRepository(Setting);
    const rows = await settingRepo.findBy({
        key: In(['netbox_url', 'netbox_token', 'poll_seconds']),
    });

    const map = new Map(rows.map((row) => [row.key, row.value]));
    return {
        netbox_url: map.get('netbox_url') ?? '',
        netbox_token: map.get('netbox_token') ?? '',
        poll_seconds: Number(map.get('poll_seconds') ?? '30') || 30,
    };
}

export async function upsertSetting(key: string, value: string) {
    const settingRepo = dataSource.getRepository(Setting);
    await settingRepo.save(settingRepo.create({ key, value }));
}
