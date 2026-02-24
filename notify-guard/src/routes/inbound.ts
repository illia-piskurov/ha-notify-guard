import type { Hono } from 'hono';
import { queueInboundMessageByBotName } from '../services/telegram';

export function registerInboundRoutes(app: Hono) {
    app.post('/api/inbound/messages', async (c) => {
        const body = await c.req.json<{
            bot_name?: string;
            chat_id?: string;
            text?: string;
            source?: string;
            idempotency_key?: string;
        }>();

        if (!body.bot_name?.trim()) {
            return c.json({ success: false, error: 'bot_name is required' }, 400);
        }

        if (!body.text?.trim()) {
            return c.json({ success: false, error: 'text is required' }, 400);
        }

        if (!body.idempotency_key?.trim()) {
            return c.json({ success: false, error: 'idempotency_key is required' }, 400);
        }

        const sourcePrefix = body.source?.trim() ? `[${body.source.trim()}] ` : '';
        const normalizedSource = body.source?.trim()
            ? `rest:${body.source.trim().toLowerCase()}`
            : 'rest';
        const result = await queueInboundMessageByBotName({
            botName: body.bot_name,
            chatId: body.chat_id,
            idempotencyKey: body.idempotency_key,
            source: normalizedSource,
            message: `${sourcePrefix}${body.text.trim()}`,
        });

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 404);
        }

        return c.json(
            {
                success: true,
                bot_id: result.botId,
                bot_name: result.botName,
                deduplicated: result.deduplicated,
                queued: result.queued,
                notification_ids: result.notificationIds,
            },
            202,
        );
    });
}
