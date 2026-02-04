"use strict";
/**
 * Cache Eviction Policies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SizeCachePolicy = exports.TTLCachePolicy = exports.LFUCachePolicy = exports.LRUCachePolicy = void 0;
var LRUCachePolicy = /** @class */ (function () {
    function LRUCachePolicy() {
    }
    LRUCachePolicy.prototype.shouldEvict = function (_entry) {
        return false;
    };
    return LRUCachePolicy;
}());
exports.LRUCachePolicy = LRUCachePolicy;
var LFUCachePolicy = /** @class */ (function () {
    function LFUCachePolicy() {
    }
    LFUCachePolicy.prototype.shouldEvict = function (_entry) {
        return false;
    };
    return LFUCachePolicy;
}());
exports.LFUCachePolicy = LFUCachePolicy;
var TTLCachePolicy = /** @class */ (function () {
    function TTLCachePolicy(ttl) {
        this.ttl = ttl;
    }
    TTLCachePolicy.prototype.shouldEvict = function (entry) {
        if (!entry.expiresAt)
            return false;
        return new Date(entry.expiresAt) < new Date();
    };
    return TTLCachePolicy;
}());
exports.TTLCachePolicy = TTLCachePolicy;
var SizeCachePolicy = /** @class */ (function () {
    function SizeCachePolicy(maxSize) {
        this.maxSize = maxSize;
    }
    SizeCachePolicy.prototype.shouldEvict = function (_entry) {
        // TODO: Implement size-based eviction
        return false;
    };
    return SizeCachePolicy;
}());
exports.SizeCachePolicy = SizeCachePolicy;
