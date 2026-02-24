import tailwindcss from '@tailwindcss/vite';
import path from "path";
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// https://vite.dev/config/
export default defineConfig({
    base: './',
    plugins: [tailwindcss(), svelte()], resolve: {
        alias: {
            $lib: path.resolve("./src/lib"),
        },
    },
    server: {
        proxy: {
            '/api': 'http://localhost:8000',
        },
    },
});
