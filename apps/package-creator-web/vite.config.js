"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var vite_1 = require("vite");
var plugin_react_1 = require("@vitejs/plugin-react");
var path_1 = require("path");
var vite_build_1 = require("../../config/vite-build");
// https://vite.dev/config/
exports.default = (0, vite_1.defineConfig)(__assign(__assign({ plugins: [(0, plugin_react_1.default)()] }, (0, vite_build_1.getSharedBuildConfig)()), { resolve: {
        alias: {
            '@': path_1.default.resolve(__dirname, './src'),
        },
    }, server: {
        port: 3001,
    } }));
