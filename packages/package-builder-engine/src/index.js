"use strict";
/**
 * @bt-synergy/package-builder-engine
 *
 * Platform-agnostic engine for downloading, parsing, building, and compressing resource packages
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryFileSystemAdapter = exports.ZipCompressor = exports.PackageBuilder = exports.ResourceDownloader = exports.PackageBuilderEngine = void 0;
exports.createEngine = createEngine;
exports.createMemoryEngine = createMemoryEngine;
// Engine
var engine_1 = require("./engine");
Object.defineProperty(exports, "PackageBuilderEngine", { enumerable: true, get: function () { return engine_1.PackageBuilderEngine; } });
// Downloader
var downloader_1 = require("./downloader");
Object.defineProperty(exports, "ResourceDownloader", { enumerable: true, get: function () { return downloader_1.ResourceDownloader; } });
// Builder
var builders_1 = require("./builders");
Object.defineProperty(exports, "PackageBuilder", { enumerable: true, get: function () { return builders_1.PackageBuilder; } });
// Compressors
var compressors_1 = require("./compressors");
Object.defineProperty(exports, "ZipCompressor", { enumerable: true, get: function () { return compressors_1.ZipCompressor; } });
// File System
var filesystem_1 = require("./filesystem");
Object.defineProperty(exports, "MemoryFileSystemAdapter", { enumerable: true, get: function () { return filesystem_1.MemoryFileSystemAdapter; } });
/**
 * Create a default engine instance
 */
var engine_2 = require("./engine");
var filesystem_2 = require("./filesystem");
function createEngine(filesystem) {
    return new engine_2.PackageBuilderEngine(filesystem);
}
function createMemoryEngine() {
    return new engine_2.PackageBuilderEngine(new filesystem_2.MemoryFileSystemAdapter());
}
