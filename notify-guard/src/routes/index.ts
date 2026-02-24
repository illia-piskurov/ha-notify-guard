import type { Hono } from 'hono';
import { registerBotsRoutes } from './bots';
import { registerDevicesRoutes } from './devices';
import { registerLogsRoutes } from './logs';
import { registerSettingsNetboxRoutes } from './settings-netbox';

export function registerApiRoutes(app: Hono) {
    registerSettingsNetboxRoutes(app);
    registerDevicesRoutes(app);
    registerBotsRoutes(app);
    registerLogsRoutes(app);
}
