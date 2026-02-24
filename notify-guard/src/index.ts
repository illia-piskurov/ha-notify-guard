import 'reflect-metadata';
import { createApp } from './app';
import { initializeRuntime } from './services/runtime';

await initializeRuntime();

const app = createApp();

export default { port: 8000, fetch: app.fetch };
