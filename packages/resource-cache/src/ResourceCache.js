"use strict";
/**
 * Resource Cache
 *
 * Multi-tier caching: Memory → Storage → Network
 */
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceCache = void 0;
var MemoryCache_1 = require("./cache/MemoryCache");
// Default in-memory storage adapter (minimal implementation)
var DefaultMemoryStorage = /** @class */ (function () {
    function DefaultMemoryStorage() {
        this.store = new Map();
    }
    DefaultMemoryStorage.prototype.set = function (key, entry) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.store.set(key, __assign({}, entry));
                return [2 /*return*/];
            });
        });
    };
    DefaultMemoryStorage.prototype.get = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var entry;
            return __generator(this, function (_a) {
                entry = this.store.get(key);
                if (!entry)
                    return [2 /*return*/, null];
                if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
                    this.store.delete(key);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/, __assign({}, entry)];
            });
        });
    };
    DefaultMemoryStorage.prototype.has = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var entry;
            return __generator(this, function (_a) {
                entry = this.store.get(key);
                if (!entry)
                    return [2 /*return*/, false];
                if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
                    this.store.delete(key);
                    return [2 /*return*/, false];
                }
                return [2 /*return*/, true];
            });
        });
    };
    DefaultMemoryStorage.prototype.delete = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.store.delete(key);
                return [2 /*return*/];
            });
        });
    };
    DefaultMemoryStorage.prototype.setMany = function (items) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, items_1, item;
            return __generator(this, function (_a) {
                for (_i = 0, items_1 = items; _i < items_1.length; _i++) {
                    item = items_1[_i];
                    this.store.set(item.key, __assign({}, item.entry));
                }
                return [2 /*return*/];
            });
        });
    };
    DefaultMemoryStorage.prototype.getMany = function (keys) {
        return __awaiter(this, void 0, void 0, function () {
            var results, _i, keys_1, key, entry;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        results = new Map();
                        _i = 0, keys_1 = keys;
                        _a.label = 1;
                    case 1:
                        if (!(_i < keys_1.length)) return [3 /*break*/, 4];
                        key = keys_1[_i];
                        return [4 /*yield*/, this.get(key)];
                    case 2:
                        entry = _a.sent();
                        if (entry)
                            results.set(key, entry);
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, results];
                }
            });
        });
    };
    DefaultMemoryStorage.prototype.deleteMany = function (keys) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, keys_2, key;
            return __generator(this, function (_a) {
                for (_i = 0, keys_2 = keys; _i < keys_2.length; _i++) {
                    key = keys_2[_i];
                    this.store.delete(key);
                }
                return [2 /*return*/];
            });
        });
    };
    DefaultMemoryStorage.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.store.clear();
                return [2 /*return*/];
            });
        });
    };
    DefaultMemoryStorage.prototype.keys = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, Array.from(this.store.keys())];
            });
        });
    };
    DefaultMemoryStorage.prototype.size = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.store.size * 1000]; // Rough estimate
            });
        });
    };
    DefaultMemoryStorage.prototype.count = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.store.size];
            });
        });
    };
    DefaultMemoryStorage.prototype.prune = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, pruned, _i, _a, _b, key, entry;
            return __generator(this, function (_c) {
                now = new Date();
                pruned = 0;
                for (_i = 0, _a = this.store; _i < _a.length; _i++) {
                    _b = _a[_i], key = _b[0], entry = _b[1];
                    if (entry.expiresAt && new Date(entry.expiresAt) < now) {
                        this.store.delete(key);
                        pruned++;
                    }
                }
                return [2 /*return*/, pruned];
            });
        });
    };
    return DefaultMemoryStorage;
}());
/**
 * Multi-tier resource cache
 *
 * Lookup order: Memory → Storage → Network
 *
 * @example
 * ```typescript
 * const cache = new ResourceCache()
 *
 * // Set content
 * await cache.set('git.door43.org/unfoldingWord/en/ult', {
 *   type: 'text',
 *   content: 'Genesis 1...',
 *   cachedAt: new Date().toISOString()
 * })
 *
 * // Get content (checks all tiers)
 * const entry = await cache.get('git.door43.org/unfoldingWord/en/ult')
 * ```
 */
var ResourceCache = /** @class */ (function () {
    function ResourceCache(options) {
        if (options === void 0) { options = {}; }
        var _a, _b;
        // Statistics
        this.stats = {
            memory: { hits: 0, misses: 0 },
            storage: { hits: 0, misses: 0 },
            network: { requests: 0, hits: 0, misses: 0, errors: 0 },
            startedAt: new Date().toISOString(),
            lastAccessAt: undefined,
        };
        this.options = {
            memoryMaxSize: options.memoryMaxSize || 50 * 1024 * 1024,
            memoryPolicy: options.memoryPolicy,
            storage: options.storage || new DefaultMemoryStorage(),
            enableNetwork: (_a = options.enableNetwork) !== null && _a !== void 0 ? _a : true,
            networkSecurity: options.networkSecurity || {},
            networkFetcher: options.networkFetcher,
            defaultTTL: options.defaultTTL || 7 * 24 * 60 * 60 * 1000, // 7 days
            maxStorageSize: options.maxStorageSize || 500 * 1024 * 1024,
            autoOptimize: (_b = options.autoOptimize) !== null && _b !== void 0 ? _b : true,
        };
        this.memoryCache = new MemoryCache_1.MemoryCache({
            maxSize: this.options.memoryMaxSize,
            policy: this.options.memoryPolicy,
        });
        this.storage = this.options.storage;
        this.networkFetcher = this.options.networkFetcher;
        this.networkSecurity = this.options.networkSecurity;
    }
    // ============================================================================
    // BASIC OPERATIONS
    // ============================================================================
    /**
     * Set cache entry
     * Stores in both memory and storage by default
     */
    ResourceCache.prototype.set = function (key_1, entry_1) {
        return __awaiter(this, arguments, void 0, function (key, entry, options) {
            var ttl;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Set expiration if TTL provided
                        if (options.ttl || this.options.defaultTTL) {
                            ttl = options.ttl || this.options.defaultTTL;
                            entry.expiresAt = new Date(Date.now() + ttl).toISOString();
                        }
                        // Set cached timestamp if not present
                        if (!entry.cachedAt) {
                            entry.cachedAt = new Date().toISOString();
                        }
                        // Store in memory cache
                        if (!options.skipMemory) {
                            this.memoryCache.set(key, entry, options.priority);
                        }
                        if (!!options.skipStorage) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.storage.set(key, entry)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get cache entry
     * Checks memory → storage → network (if enabled)
     */
    ResourceCache.prototype.get = function (key_1) {
        return __awaiter(this, arguments, void 0, function (key, options) {
            var memoryEntry, storageEntry, networkAllowed, networkEntry, error_1;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.stats.lastAccessAt = new Date().toISOString();
                        if (!!options.skipMemory) return [3 /*break*/, 4];
                        memoryEntry = this.memoryCache.get(key);
                        if (!memoryEntry) return [3 /*break*/, 3];
                        this.stats.memory.hits++;
                        if (!(options.refreshTTL && this.options.defaultTTL)) return [3 /*break*/, 2];
                        memoryEntry.expiresAt = new Date(Date.now() + this.options.defaultTTL).toISOString();
                        return [4 /*yield*/, this.storage.set(key, memoryEntry)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/, __assign(__assign({}, memoryEntry), { source: 'memory' })];
                    case 3:
                        this.stats.memory.misses++;
                        _a.label = 4;
                    case 4:
                        if (!!options.skipStorage) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.storage.get(key)];
                    case 5:
                        storageEntry = _a.sent();
                        if (!storageEntry) return [3 /*break*/, 8];
                        this.stats.storage.hits++;
                        // Load into memory cache
                        if (!options.skipMemory) {
                            this.memoryCache.set(key, storageEntry);
                        }
                        if (!(options.refreshTTL && this.options.defaultTTL)) return [3 /*break*/, 7];
                        storageEntry.expiresAt = new Date(Date.now() + this.options.defaultTTL).toISOString();
                        return [4 /*yield*/, this.storage.set(key, storageEntry)];
                    case 6:
                        _a.sent();
                        _a.label = 7;
                    case 7: return [2 /*return*/, __assign(__assign({}, storageEntry), { source: 'storage' })];
                    case 8:
                        this.stats.storage.misses++;
                        _a.label = 9;
                    case 9:
                        if (!(options.allowNetwork && this.options.enableNetwork && this.networkFetcher)) return [3 /*break*/, 17];
                        this.stats.network.requests++;
                        return [4 /*yield*/, this.isNetworkAllowed()];
                    case 10:
                        networkAllowed = _a.sent();
                        if (!networkAllowed) {
                            return [2 /*return*/, null];
                        }
                        _a.label = 11;
                    case 11:
                        _a.trys.push([11, 16, , 17]);
                        return [4 /*yield*/, this.networkFetcher(key)];
                    case 12:
                        networkEntry = _a.sent();
                        if (!networkEntry) return [3 /*break*/, 14];
                        this.stats.network.hits++;
                        // Cache the fetched entry
                        return [4 /*yield*/, this.set(key, networkEntry)];
                    case 13:
                        // Cache the fetched entry
                        _a.sent();
                        return [2 /*return*/, __assign(__assign({}, networkEntry), { source: 'network' })];
                    case 14:
                        this.stats.network.misses++;
                        _a.label = 15;
                    case 15: return [3 /*break*/, 17];
                    case 16:
                        error_1 = _a.sent();
                        this.stats.network.errors++;
                        console.error("Network fetch failed for ".concat(key, ":"), error_1);
                        return [3 /*break*/, 17];
                    case 17: return [2 /*return*/, null];
                }
            });
        });
    };
    /**
     * Check if key exists in cache
     */
    ResourceCache.prototype.has = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.memoryCache.has(key))
                            return [2 /*return*/, true];
                        return [4 /*yield*/, this.storage.has(key)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Delete entry from cache
     */
    ResourceCache.prototype.delete = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.memoryCache.delete(key);
                        return [4 /*yield*/, this.storage.delete(key)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Clear entire cache
     */
    ResourceCache.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.memoryCache.clear();
                        return [4 /*yield*/, this.storage.clear()
                            // Reset stats
                        ];
                    case 1:
                        _a.sent();
                        // Reset stats
                        this.stats.memory.hits = 0;
                        this.stats.memory.misses = 0;
                        this.stats.storage.hits = 0;
                        this.stats.storage.misses = 0;
                        this.stats.network.requests = 0;
                        this.stats.network.hits = 0;
                        this.stats.network.misses = 0;
                        this.stats.network.errors = 0;
                        return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================================
    // BULK OPERATIONS
    // ============================================================================
    /**
     * Set multiple entries
     */
    ResourceCache.prototype.setMany = function (items) {
        return __awaiter(this, void 0, void 0, function () {
            var storageItems, toSave;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        storageItems = items.map(function (_a) {
                            var key = _a.key, entry = _a.entry, options = _a.options;
                            // Set expiration
                            if (((options === null || options === void 0 ? void 0 : options.ttl) || _this.options.defaultTTL) && !entry.expiresAt) {
                                var ttl = (options === null || options === void 0 ? void 0 : options.ttl) || _this.options.defaultTTL;
                                entry.expiresAt = new Date(Date.now() + ttl).toISOString();
                            }
                            // Set cached timestamp
                            if (!entry.cachedAt) {
                                entry.cachedAt = new Date().toISOString();
                            }
                            // Add to memory cache
                            if (!(options === null || options === void 0 ? void 0 : options.skipMemory)) {
                                _this.memoryCache.set(key, entry, options === null || options === void 0 ? void 0 : options.priority);
                            }
                            return { key: key, entry: entry };
                        });
                        toSave = storageItems.filter(function (_, i) { var _a; return !((_a = items[i].options) === null || _a === void 0 ? void 0 : _a.skipStorage); });
                        if (!(toSave.length > 0)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.storage.setMany(toSave)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get multiple entries
     */
    ResourceCache.prototype.getMany = function (keys_3) {
        return __awaiter(this, arguments, void 0, function (keys, options) {
            var results, missingKeys, _i, keys_4, key, entry, storageResults, _a, storageResults_1, _b, key, entry;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        results = new Map();
                        missingKeys = [];
                        // Check memory cache
                        if (!options.skipMemory) {
                            for (_i = 0, keys_4 = keys; _i < keys_4.length; _i++) {
                                key = keys_4[_i];
                                entry = this.memoryCache.get(key);
                                if (entry) {
                                    results.set(key, __assign(__assign({}, entry), { source: 'memory' }));
                                    this.stats.memory.hits++;
                                }
                                else {
                                    missingKeys.push(key);
                                    this.stats.memory.misses++;
                                }
                            }
                        }
                        if (!(!options.skipStorage && missingKeys.length > 0)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.storage.getMany(missingKeys)];
                    case 1:
                        storageResults = _c.sent();
                        for (_a = 0, storageResults_1 = storageResults; _a < storageResults_1.length; _a++) {
                            _b = storageResults_1[_a], key = _b[0], entry = _b[1];
                            results.set(key, __assign(__assign({}, entry), { source: 'storage' }));
                            this.stats.storage.hits++;
                            // Load into memory
                            if (!options.skipMemory) {
                                this.memoryCache.set(key, entry);
                            }
                        }
                        _c.label = 2;
                    case 2: return [2 /*return*/, results];
                }
            });
        });
    };
    /**
     * Delete multiple entries
     */
    ResourceCache.prototype.deleteMany = function (keys) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, keys_3, key;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        for (_i = 0, keys_3 = keys; _i < keys_3.length; _i++) {
                            key = keys_3[_i];
                            this.memoryCache.delete(key);
                        }
                        return [4 /*yield*/, this.storage.deleteMany(keys)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================================
    // NETWORK CONFIGURATION
    // ============================================================================
    /**
     * Set network fetcher
     */
    ResourceCache.prototype.setNetworkFetcher = function (fetcher) {
        this.networkFetcher = fetcher;
    };
    /**
     * Set network security options
     */
    ResourceCache.prototype.setNetworkSecurity = function (options) {
        this.networkSecurity = __assign(__assign({}, this.networkSecurity), options);
    };
    /**
     * Check if network is allowed based on security settings
     */
    ResourceCache.prototype.isNetworkAllowed = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                // Always allow if no restrictions
                if (!this.networkSecurity.requireSecureConnection &&
                    !this.networkSecurity.requireSecureWifi &&
                    !((_a = this.networkSecurity.allowedDomains) === null || _a === void 0 ? void 0 : _a.length)) {
                    return [2 /*return*/, true];
                }
                // TODO: Implement actual security checks
                // For now, always allow (platform-specific implementation needed)
                return [2 /*return*/, true];
            });
        });
    };
    // ============================================================================
    // STATISTICS & MONITORING
    // ============================================================================
    /**
     * Get cache statistics
     */
    ResourceCache.prototype.getStats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var memoryStats, storageSize, storageCount, totalHits, totalMisses, hitRate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        memoryStats = this.memoryCache.getStats();
                        return [4 /*yield*/, this.storage.size()];
                    case 1:
                        storageSize = _a.sent();
                        return [4 /*yield*/, this.storage.count()];
                    case 2:
                        storageCount = _a.sent();
                        totalHits = this.stats.memory.hits + this.stats.storage.hits;
                        totalMisses = this.stats.memory.misses + this.stats.storage.misses;
                        hitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;
                        return [2 /*return*/, {
                                totalEntries: memoryStats.entries + storageCount,
                                totalSize: memoryStats.size + storageSize,
                                hitRate: hitRate,
                                memory: memoryStats,
                                storage: {
                                    entries: storageCount,
                                    size: storageSize,
                                    maxSize: this.options.maxStorageSize,
                                    hits: this.stats.storage.hits,
                                    misses: this.stats.storage.misses,
                                },
                                network: {
                                    requests: this.stats.network.requests,
                                    hits: this.stats.network.hits,
                                    misses: this.stats.network.misses,
                                    errors: this.stats.network.errors,
                                },
                                startedAt: this.stats.startedAt,
                                lastAccessAt: this.stats.lastAccessAt,
                            }];
                }
            });
        });
    };
    /**
     * Get total cache size
     */
    ResourceCache.prototype.getSize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var memorySize, storageSize;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        memorySize = this.memoryCache.size();
                        return [4 /*yield*/, this.storage.size()];
                    case 1:
                        storageSize = _a.sent();
                        return [2 /*return*/, memorySize + storageSize];
                }
            });
        });
    };
    // ============================================================================
    // MAINTENANCE
    // ============================================================================
    /**
     * Prune expired entries
     */
    ResourceCache.prototype.prune = function () {
        return __awaiter(this, void 0, void 0, function () {
            var memoryPruned, storagePruned;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        memoryPruned = this.memoryCache.prune();
                        return [4 /*yield*/, this.storage.prune()];
                    case 1:
                        storagePruned = _a.sent();
                        return [2 /*return*/, memoryPruned + storagePruned];
                }
            });
        });
    };
    /**
     * Optimize storage
     */
    ResourceCache.prototype.optimize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.prune()];
                    case 1:
                        _a.sent();
                        if (!this.storage.optimize) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.storage.optimize()];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Export cache data
     */
    ResourceCache.prototype.export = function () {
        return __awaiter(this, void 0, void 0, function () {
            var keys, entries;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.storage.keys()];
                    case 1:
                        keys = _a.sent();
                        return [4 /*yield*/, this.storage.getMany(keys)];
                    case 2:
                        entries = _a.sent();
                        return [2 /*return*/, {
                                version: '1.0.0',
                                exportedAt: new Date().toISOString(),
                                entries: Array.from(entries.entries()).map(function (_a) {
                                    var key = _a[0], entry = _a[1];
                                    return ({
                                        key: key,
                                        entry: entry,
                                    });
                                }),
                            }];
                }
            });
        });
    };
    /**
     * Import cache data
     */
    ResourceCache.prototype.import = function (data_1) {
        return __awaiter(this, arguments, void 0, function (data, options) {
            var now, imported, items, _i, _a, _b, key, entry;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        now = new Date();
                        imported = 0;
                        if (!!options.merge) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.clear()];
                    case 1:
                        _c.sent();
                        _c.label = 2;
                    case 2:
                        items = [];
                        for (_i = 0, _a = data.entries; _i < _a.length; _i++) {
                            _b = _a[_i], key = _b.key, entry = _b.entry;
                            // Skip expired if requested
                            if (options.skipExpired && entry.expiresAt && new Date(entry.expiresAt) < now) {
                                continue;
                            }
                            // Update timestamps if requested
                            if (options.updateTimestamps) {
                                entry.cachedAt = now.toISOString();
                                if (entry.expiresAt) {
                                    // Recalculate expiration based on default TTL
                                    entry.expiresAt = new Date(now.getTime() + this.options.defaultTTL).toISOString();
                                }
                            }
                            items.push({ key: key, entry: entry });
                            imported++;
                        }
                        if (!(items.length > 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.storage.setMany(items)];
                    case 3:
                        _c.sent();
                        _c.label = 4;
                    case 4: return [2 /*return*/, imported];
                }
            });
        });
    };
    return ResourceCache;
}());
exports.ResourceCache = ResourceCache;
