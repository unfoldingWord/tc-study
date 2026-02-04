"use strict";
/**
 * Memory Cache Implementation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryCache = void 0;
var MemoryCache = /** @class */ (function () {
    function MemoryCache() {
        this.cache = new Map();
    }
    MemoryCache.prototype.get = function (key) {
        return this.cache.get(key);
    };
    MemoryCache.prototype.set = function (key, value) {
        this.cache.set(key, value);
    };
    MemoryCache.prototype.has = function (key) {
        return this.cache.has(key);
    };
    MemoryCache.prototype.delete = function (key) {
        return this.cache.delete(key);
    };
    MemoryCache.prototype.clear = function () {
        this.cache.clear();
    };
    MemoryCache.prototype.keys = function () {
        return Array.from(this.cache.keys());
    };
    return MemoryCache;
}());
exports.MemoryCache = MemoryCache;
