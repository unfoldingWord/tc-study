import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // Fix linked-panels to use dist files
            'linked-panels': path.resolve(__dirname, './node_modules/linked-panels/dist/index.js'),
            // Alias workspace packages to their source
            '@bt-synergy/navigation': path.resolve(__dirname, '../../packages/navigation/src/index.ts'),
            '@bt-synergy/study-store': path.resolve(__dirname, '../../packages/study-store/src/index.ts'),
        },
    },
    server: {
        port: 3000,
        open: true,
    },
});
