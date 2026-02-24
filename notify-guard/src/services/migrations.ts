import { dataSource } from '../db/data-source';
import { Bot, BotChat } from '../db/entities';

export async function migrateLegacyBotChats() {
    const botRepo = dataSource.getRepository(Bot);
    const botChatRepo = dataSource.getRepository(BotChat);

    const bots = await botRepo.find();
    for (const bot of bots) {
        if (!bot.chatId?.trim()) {
            continue;
        }

        const exists = await botChatRepo.findOneBy({
            botId: bot.id,
            chatId: bot.chatId.trim(),
        });

        if (exists) {
            continue;
        }

        await botChatRepo.save(botChatRepo.create({
            botId: bot.id,
            chatId: bot.chatId.trim(),
            isActive: bot.isActive,
        }));
    }
}
