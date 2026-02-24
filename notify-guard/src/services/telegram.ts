import { In } from 'typeorm';
import { dataSource } from '../db/data-source';
import { Bot, BotChat, Device, DeviceNotification, Notification } from '../db/entities';

export async function runTelegramWorker() {
    const notificationRepo = dataSource.getRepository(Notification);
    const now = new Date();
    const jobs = await notificationRepo
        .createQueryBuilder('notification')
        .where('(notification.status = :pending OR notification.status = :failed)', {
            pending: 'pending',
            failed: 'failed',
        })
        .andWhere('(notification.next_attempt_at IS NULL OR notification.next_attempt_at <= :now)', {
            now,
        })
        .orderBy('notification.id', 'ASC')
        .limit(20)
        .getMany();

    for (const job of jobs) {
        try {
            const response = await fetch(`https://api.telegram.org/bot${job.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: job.chatId,
                    text: job.message,
                }),
            });

            if (!response.ok) {
                throw new Error(`Telegram API ${response.status}`);
            }

            job.status = 'sent';
            job.sentAt = new Date();
            job.attempts += 1;
            job.lastError = null;
            job.nextAttemptAt = null;
            await notificationRepo.save(job);
        } catch (error) {
            const attempts = job.attempts + 1;
            job.status = 'failed';
            job.attempts = attempts;
            job.lastError = toErrorMessage(error);
            job.nextAttemptAt = new Date(Date.now() + getRetryDelayMs(attempts));
            await notificationRepo.save(job);
        }
    }
}

export async function queueAlert(device: Device, message: string) {
    const mappingRepo = dataSource.getRepository(DeviceNotification);
    const botRepo = dataSource.getRepository(Bot);
    const botChatRepo = dataSource.getRepository(BotChat);
    const notificationRepo = dataSource.getRepository(Notification);

    const mappings = await mappingRepo.findBy({ deviceId: device.id });
    if (mappings.length === 0) {
        return;
    }

    const botIds = mappings.map((item) => item.botId);
    const assignedBots = await botRepo.find({
        where: { id: In(botIds) },
    });

    if (assignedBots.length === 0) {
        return;
    }

    const chats = await botChatRepo.find({
        where: {
            botId: In(assignedBots.map((bot) => bot.id)),
            isActive: true,
        },
    });

    if (chats.length === 0) {
        return;
    }

    const tokenByBotId = new Map(assignedBots.map((bot) => [bot.id, bot.token]));
    const seenTargets = new Set<string>();
    const notifications = chats
        .map((chat) => {
            const dedupeKey = `${chat.botId}:${chat.chatId}`;
            if (seenTargets.has(dedupeKey)) {
                return null;
            }
            seenTargets.add(dedupeKey);

            const token = tokenByBotId.get(chat.botId);
            if (!token) {
                return null;
            }

            return notificationRepo.create({
                botId: chat.botId,
                token,
                chatId: chat.chatId,
                message,
                status: 'pending',
                attempts: 0,
                sentAt: null,
                lastError: null,
                nextAttemptAt: null,
            });
        })
        .filter((item): item is Notification => item !== null);

    if (notifications.length === 0) {
        return;
    }

    await notificationRepo.save(notifications);
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function getRetryDelayMs(attempt: number): number {
    const retryDelays = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000] as const;
    if (attempt <= 0) {
        return retryDelays[0] ?? 5_000;
    }

    const index = Math.min(attempt - 1, retryDelays.length - 1);
    return retryDelays[index] ?? 300_000;
}
