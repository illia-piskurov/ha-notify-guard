import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const addonRoot = dirname(dirname(sourceDir));
const dbPath = existsSync('/data') ? '/data/notifications.db' : join(addonRoot, 'data', 'notifications.db');

mkdirSync(dirname(dbPath), { recursive: true });

export const dataSource = new DataSource({
    type: 'sqlite',
    database: dbPath,
    entities: [...ALL_ENTITIES],
    synchronize: true,
    logging: false,
});
