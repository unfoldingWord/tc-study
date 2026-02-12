var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { getSharedBuildConfig } from '../../config/vite-build';
// https://vitejs.dev/config/
export default defineConfig(__assign(__assign({ plugins: [react()] }, getSharedBuildConfig()), { resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    }, server: {
        port: 3001,
    }, define: {
        'process.env': '{}',
        global: 'globalThis',
    }, optimizeDeps: {
        exclude: ['@bt-synergy/toc-generator-cli'],
    } }));
