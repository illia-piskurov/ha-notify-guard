import { runMonitorCycle } from '../services/monitor';
import { runTelegramWorker } from '../services/telegram';

let isMonitorCycleRunning = false;
let isTelegramWorkerRunning = false;

export function startBackgroundWorkers() {
    setInterval(() => {
        if (isMonitorCycleRunning) {
            return;
        }

        isMonitorCycleRunning = true;
        runMonitorCycle()
            .catch((error) => {
                console.error('monitor cycle failed:', error);
            })
            .finally(() => {
                isMonitorCycleRunning = false;
            });
    }, 30_000);

    setInterval(() => {
        if (isTelegramWorkerRunning) {
            return;
        }

        isTelegramWorkerRunning = true;
        runTelegramWorker()
            .catch((error) => {
                console.error('telegram worker failed:', error);
            })
            .finally(() => {
                isTelegramWorkerRunning = false;
            });
    }, 5_000);
}
