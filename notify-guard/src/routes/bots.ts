import type { Hono } from 'hono';
import { dataSource } from '../db/data-source';
import { Bot, BotChat, Chat, DeviceNotification } from '../db/entities';

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

    app.get('/api/chats', async (c) => {
        const chatRepo = dataSource.getRepository(Chat);
        const botChatRepo = dataSource.getRepository(BotChat);

        const [chats, assignments] = await Promise.all([
            chatRepo.find({ order: { id: 'DESC' } }),
            botChatRepo.find(),
        ]);

        const assignmentCountByChatId = new Map<number, number>();
        for (const assignment of assignments) {
            if (!assignment.chatRefId) {
                continue;
            }

            assignmentCountByChatId.set(
                assignment.chatRefId,
                (assignmentCountByChatId.get(assignment.chatRefId) ?? 0) + 1,
            );
        }

        return c.json({
            chats: chats.map((chat) => ({
                id: chat.id,
                chatId: chat.chatId,
                name: chat.name,
                isActive: chat.isActive,
                assignmentCount: assignmentCountByChatId.get(chat.id) ?? 0,
            })),
        });
    });

    app.post('/api/chats', async (c) => {
        const body = await c.req.json<{ chatId?: string; name?: string }>();

        const chatId = body.chatId?.trim();
        const name = body.name?.trim();

        if (!chatId || !name) {
            return c.json({ success: false, error: 'chatId and name are required' }, 400);
        }

        const chatRepo = dataSource.getRepository(Chat);
        const exists = await chatRepo.findOneBy({ chatId });

        if (exists) {
            return c.json({ success: false, error: 'Chat already exists' }, 409);
        }

        const created = await chatRepo.save(chatRepo.create({
            chatId,
            name,
            isActive: true,
        }));

        return c.json({
            success: true,
            chat: {
                id: created.id,
                chatId: created.chatId,
                name: created.name,
                isActive: created.isActive,
                assignmentCount: 0,
            },
        });
    });

    app.patch('/api/chats/:id', async (c) => {
        const id = Number(c.req.param('id'));
        const body = await c.req.json<{ chatId?: string; name?: string; isActive?: boolean }>();

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid chat id' }, 400);
        }

        const chatRepo = dataSource.getRepository(Chat);
        const chat = await chatRepo.findOneBy({ id });

        if (!chat) {
            return c.json({ success: false, error: 'Chat not found' }, 404);
        }

        if (typeof body.chatId === 'string' && body.chatId.trim()) {
            const nextChatId = body.chatId.trim();
            const duplicate = await chatRepo.findOneBy({ chatId: nextChatId });
            if (duplicate && duplicate.id !== id) {
                return c.json({ success: false, error: 'Chat already exists' }, 409);
            }
            chat.chatId = nextChatId;
        }

        if (typeof body.name === 'string' && body.name.trim()) {
            chat.name = body.name.trim();
        }

        if (typeof body.isActive === 'boolean') {
            chat.isActive = body.isActive;
        }

        const updated = await chatRepo.save(chat);
        return c.json({
            success: true,
            chat: {
                id: updated.id,
                chatId: updated.chatId,
                name: updated.name,
                isActive: updated.isActive,
            },
        });
    });

    app.delete('/api/chats/:id', async (c) => {
        const id = Number(c.req.param('id'));

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid chat id' }, 400);
        }

        const chatRepo = dataSource.getRepository(Chat);
        const botChatRepo = dataSource.getRepository(BotChat);
        const chat = await chatRepo.findOneBy({ id });

        if (!chat) {
            return c.json({ success: false, error: 'Chat not found' }, 404);
        }

        await botChatRepo.delete({ chatRefId: id });
        await chatRepo.delete({ id });

        return c.json({ success: true });
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

    app.get('/api/bots/:id/chats', async (c) => {
        const id = Number(c.req.param('id'));

        if (Number.isNaN(id)) {
            return c.json({ success: false, error: 'Invalid bot id' }, 400);
        }

        const botRepo = dataSource.getRepository(Bot);
        const chatRepo = dataSource.getRepository(Chat);
        const botChatRepo = dataSource.getRepository(BotChat);

        const bot = await botRepo.findOneBy({ id });
        if (!bot) {
            return c.json({ success: false, error: 'Bot not found' }, 404);
        }

        const [chats, assignments] = await Promise.all([
            chatRepo.find({ order: { id: 'DESC' } }),
            botChatRepo.find({ where: { botId: id } }),
        ]);

        const assignmentByChatRefId = new Map<number, BotChat>();
        for (const assignment of assignments) {
            if (assignment.chatRefId) {
                assignmentByChatRefId.set(assignment.chatRefId, assignment);
            }
        }

        return c.json({
            bot: {
                id: bot.id,
                name: bot.name,
            },
            chats: chats.map((chat) => {
                const assignment = assignmentByChatRefId.get(chat.id);
                return {
                    id: chat.id,
                    chatId: chat.chatId,
                    name: chat.name,
                    isActive: chat.isActive,
                    assigned: Boolean(assignment && assignment.isActive),
                };
            }),
        });
    });

    app.patch('/api/bots/:id/chats/:chatId', async (c) => {
        const id = Number(c.req.param('id'));
        const chatId = Number(c.req.param('chatId'));
        const body = await c.req.json<{ assigned?: boolean }>();

        if (Number.isNaN(id) || Number.isNaN(chatId)) {
            return c.json({ success: false, error: 'Invalid id' }, 400);
        }

        if (typeof body.assigned !== 'boolean') {
            return c.json({ success: false, error: 'assigned is required' }, 400);
        }

        const botRepo = dataSource.getRepository(Bot);
        const chatRepo = dataSource.getRepository(Chat);
        const botChatRepo = dataSource.getRepository(BotChat);

        const [bot, chat] = await Promise.all([
            botRepo.findOneBy({ id }),
            chatRepo.findOneBy({ id: chatId }),
        ]);

        if (!bot) {
            return c.json({ success: false, error: 'Bot not found' }, 404);
        }

        if (!chat) {
            return c.json({ success: false, error: 'Chat not found' }, 404);
        }

        const existing = await botChatRepo.findOneBy({ botId: id, chatRefId: chatId });
        if (body.assigned) {
            if (existing) {
                if (!existing.isActive) {
                    existing.isActive = true;
                    await botChatRepo.save(existing);
                }
            } else {
                await botChatRepo.save(botChatRepo.create({
                    botId: id,
                    chatRefId: chatId,
                    chatId: chat.chatId,
                    isActive: true,
                }));
            }
        } else if (existing) {
            await botChatRepo.delete({ id: existing.id });
        }

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
