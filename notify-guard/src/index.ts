import 'reflect-metadata';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { initializeRuntime } from './services/runtime';

await initializeRuntime();

const app = createApp();

serve({ fetch: app.fetch, port: 8000 }, (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
});
