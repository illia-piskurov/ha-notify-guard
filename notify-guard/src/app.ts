import { existsSync, readFileSync } from 'node:fs';
import { serveStatic } from 'hono/bun';
import { Hono } from 'hono';
import { buildErrorDetails, writeAppLog } from './lib/app-logger';
import { registerApiRoutes } from './routes';

const DIST_ROOT = './dist';

export function createApp() {
    const app = new Hono();

    app.use('/assets/*', serveStatic({ root: DIST_ROOT }));

    app.use('/api/*', async (c, next) => {
        c.header('Access-Control-Allow-Origin', '*');
        c.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
        c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');

        if (c.req.method === 'OPTIONS') {
            return c.body(null, 204);
        }

        const startedAt = Date.now();

        try {
            await next();

            if (c.res.status >= 500) {
                await writeAppLog({
                    level: 'error',
                    scope: 'http',
                    message: 'HTTP request failed',
                    details: `duration_ms=${Date.now() - startedAt}`,
                    path: c.req.path,
                    method: c.req.method,
                    status: c.res.status,
                });
            }

            return c.res;
        } catch (error) {
            await writeAppLog({
                level: 'error',
                scope: 'http',
                message: 'Unhandled exception in request',
                details: buildErrorDetails(error),
                path: c.req.path,
                method: c.req.method,
                status: 500,
            });

            throw error;
        }
    });

    app.onError((error, c) => {
        void writeAppLog({
            level: 'error',
            scope: 'http',
            message: 'Hono onError handler',
            details: buildErrorDetails(error),
            path: c.req.path,
            method: c.req.method,
            status: 500,
        });

        if (c.req.path.startsWith('/api/')) {
            return c.json({ success: false, error: 'Internal server error' }, 500);
        }

        return c.text('Internal server error', 500);
    });

    app.get('/api/health', (c) => c.json({ ok: true }));

    registerApiRoutes(app);

    app.get('*', (c) => {
        const indexPath = `${DIST_ROOT}/index.html`;
        if (existsSync(indexPath)) {
            return c.html(readFileSync(indexPath, 'utf-8'));
        }

        return c.text('Frontend build not found. Run frontend build first.', 404);
    });

    return app;
}
