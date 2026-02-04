"use strict";
/**
 * @bt-synergy/resource-cache
 *
 * Multi-tier caching for resource content
 *
 * Note: Storage adapters are now separate packages:
 * - @bt-synergy/cache-adapter-memory
 * - @bt-synergy/cache-adapter-indexeddb
 * - @bt-synergy/cache-adapter-sqlite (future)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SizeCachePolicy = exports.TTLCachePolicy = exports.LFUCachePolicy = exports.LRUCachePolicy = exports.MemoryCache = exports.ResourceCache = void 0;
// Main cache class
var ResourceCache_1 = require("./ResourceCache");
Object.defineProperty(exports, "ResourceCache", { enumerable: true, get: function () { return ResourceCache_1.ResourceCache; } });
// Memory cache
var MemoryCache_1 = require("./cache/MemoryCache");
Object.defineProperty(exports, "MemoryCache", { enumerable: true, get: function () { return MemoryCache_1.MemoryCache; } });
// Policies
var policies_1 = require("./cache/policies");
Object.defineProperty(exports, "LRUCachePolicy", { enumerable: true, get: function () { return policies_1.LRUCachePolicy; } });
Object.defineProperty(exports, "LFUCachePolicy", { enumerable: true, get: function () { return policies_1.LFUCachePolicy; } });
Object.defineProperty(exports, "TTLCachePolicy", { enumerable: true, get: function () { return policies_1.TTLCachePolicy; } });
Object.defineProperty(exports, "SizeCachePolicy", { enumerable: true, get: function () { return policies_1.SizeCachePolicy; } });
