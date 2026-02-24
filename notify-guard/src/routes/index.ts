import type { Hono } from 'hono';
import { registerBotsRoutes } from './bots';
import { registerDevicesRoutes } from './devices';
import { registerInboundRoutes } from './inbound';
import { registerLogsRoutes } from './logs';
import { registerSettingsNetboxRoutes } from './settings-netbox';

export function registerApiRoutes(app: Hono) {
    registerSettingsNetboxRoutes(app);
    registerDevicesRoutes(app);
    registerBotsRoutes(app);
    registerInboundRoutes(app);
    registerLogsRoutes(app);
}
