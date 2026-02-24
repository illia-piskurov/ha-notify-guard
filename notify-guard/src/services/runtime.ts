import { dataSource } from '../db/data-source';
import { migrateLegacyBotChats } from './migrations';
import { startBackgroundWorkers } from '../workers/scheduler';

export async function initializeRuntime() {
    if (!dataSource.isInitialized) {
        await dataSource.initialize();
    }

    await migrateLegacyBotChats();

    startBackgroundWorkers();
}
