import type { Hono } from 'hono';
import { dataSource } from '../db/data-source';
import { Bot, BotChat, DeviceNotification } from '../db/entities';

export function registerBotsRoutes(app: Hono) {
    app.get('/api/bots', async (c) => {
        const botRepo = dataSource.getRepository(Bot);
        const botChatRepo = dataSource.getRepository(BotChat);

        const bots = await botRepo.find({ order: { id: 'DESC' } });
        const chats = await botChatRepo.find();

        const chatsByBotId = new Map<number, BotChat[]>();
        for (const chat of chats) {
            const list = chatsByBotId.get(chat.botId) ?? [];
            list.push(chat);
            chatsByBotId.set(chat.botId, list);
        }

        return c.json({
            bots: bots.map((bot) => ({
                id: bot.id,
                name: bot.name,
                chatCount: chatsByBotId.get(bot.id)?.length ?? 0,
                activeChatCount: chatsByBotId.get(bot.id)?.filter((chat) => chat.isActive).length ?? 0,
            })),
        });
    });

    app.post('/api/bots', async (c) => {
        const body = await c.req.json<{ name?: string; token?: string }>();

        if (!body.name?.trim() || !body.token?.trim()) {
            return c.json({ success: false, error: 'name and token are required' }, 400);
        }

        const botRepo = dataSource.getRepository(Bot);
        const entity = botRepo.create({
            name: body.name.trim(),
            token: body.token.trim(),
            chatId: '',
            isActive: true,
        });

        const created = await botRepo.save(entity);
        return c.json({ success: true, id: created.id });
    });

    app.patch('/api/bots/:id', async (c) => {
        const id = Number(c.req.param('id'));
        const body = await c.req.json<{ name?: string; token?: string }>();

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid bot id' }, 400);
        }

        const botRepo = dataSource.getRepository(Bot);
        const bot = await botRepo.findOneBy({ id });

        if (!bot) {
            return c.json({ success: false, error: 'Bot not found' }, 404);
        }

        bot.name = body.name?.trim() || bot.name;
        bot.token = body.token?.trim() || bot.token;

        await botRepo.save(bot);
        return c.json({ success: true });
    });

    app.get('/api/bots/:id', async (c) => {
        const id = Number(c.req.param('id'));

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid bot id' }, 400);
        }

        const botRepo = dataSource.getRepository(Bot);
        const botChatRepo = dataSource.getRepository(BotChat);
        const bot = await botRepo.findOneBy({ id });

        if (!bot) {
            return c.json({ success: false, error: 'Bot not found' }, 404);
        }

        const chats = await botChatRepo.find({
            where: { botId: id },
            order: { id: 'DESC' },
        });

        return c.json({
            bot: {
                id: bot.id,
                name: bot.name,
                token: bot.token,
            },
            chats: chats.map((chat) => ({
                id: chat.id,
                chatId: chat.chatId,
                isActive: chat.isActive,
            })),
        });
    });

    app.post('/api/bots/:id/chats', async (c) => {
        const id = Number(c.req.param('id'));
        const body = await c.req.json<{ chatId?: string; isActive?: boolean }>();

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid bot id' }, 400);
        }

        if (!body.chatId?.trim()) {
            return c.json({ success: false, error: 'chatId is required' }, 400);
        }

        const botRepo = dataSource.getRepository(Bot);
        const botChatRepo = dataSource.getRepository(BotChat);
        const bot = await botRepo.findOneBy({ id });

        if (!bot) {
            return c.json({ success: false, error: 'Bot not found' }, 404);
        }

        const chat = botChatRepo.create({
            botId: id,
            chatId: body.chatId.trim(),
            isActive: body.isActive !== false,
        });

        const created = await botChatRepo.save(chat);
        return c.json({
            success: true,
            chat: {
                id: created.id,
                chatId: created.chatId,
                isActive: created.isActive,
            },
        });
    });

    app.patch('/api/bot-chats/:id', async (c) => {
        const id = Number(c.req.param('id'));
        const body = await c.req.json<{ chatId?: string; isActive?: boolean }>();

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid chat id' }, 400);
        }

        const botChatRepo = dataSource.getRepository(BotChat);
        const chat = await botChatRepo.findOneBy({ id });

        if (!chat) {
            return c.json({ success: false, error: 'Chat not found' }, 404);
        }

        if (typeof body.chatId === 'string' && body.chatId.trim()) {
            chat.chatId = body.chatId.trim();
        }

        if (typeof body.isActive === 'boolean') {
            chat.isActive = body.isActive;
        }

        await botChatRepo.save(chat);
        return c.json({ success: true });
    });

    app.delete('/api/bot-chats/:id', async (c) => {
        const id = Number(c.req.param('id'));

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid chat id' }, 400);
        }

        const botChatRepo = dataSource.getRepository(BotChat);
        await botChatRepo.delete({ id });

        return c.json({ success: true });
    });

    app.delete('/api/bots/:id', async (c) => {
        const id = Number(c.req.param('id'));

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid bot id' }, 400);
        }

        const mappingRepo = dataSource.getRepository(DeviceNotification);
        const botChatRepo = dataSource.getRepository(BotChat);
        const botRepo = dataSource.getRepository(Bot);

        await botChatRepo.delete({ botId: id });
        await mappingRepo.delete({ botId: id });
        await botRepo.delete({ id });

        return c.json({ success: true });
    });
}
