import { dataSource } from '../db/data-source';
import { startBackgroundWorkers } from '../workers/scheduler';

export async function initializeRuntime() {
    if (!dataSource.isInitialized) {
        await dataSource.initialize();
    }

    startBackgroundWorkers();
}
