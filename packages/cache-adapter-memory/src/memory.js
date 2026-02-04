"use strict";
/**
 * Memory Storage Adapter
 *
 * In-memory storage for testing
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
exports.MemoryCacheStorage = void 0;
/**
 * Simple in-memory storage adapter
 * For testing purposes only - not persistent
 */
var MemoryCacheStorage = /** @class */ (function () {
    function MemoryCacheStorage() {
        this.store = new Map();
    }
    MemoryCacheStorage.prototype.set = function (key, entry) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.store.set(key, __assign({}, entry));
                return [2 /*return*/];
            });
        });
    };
    MemoryCacheStorage.prototype.get = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var entry;
            return __generator(this, function (_a) {
                entry = this.store.get(key);
                if (!entry)
                    return [2 /*return*/, null
                        // Check if expired
                    ];
                // Check if expired
                if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
                    this.store.delete(key);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/, __assign({}, entry)];
            });
        });
    };
    MemoryCacheStorage.prototype.has = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var entry;
            return __generator(this, function (_a) {
                entry = this.store.get(key);
                if (!entry)
                    return [2 /*return*/, false
                        // Check if expired
                    ];
                // Check if expired
                if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
                    this.store.delete(key);
                    return [2 /*return*/, false];
                }
                return [2 /*return*/, true];
            });
        });
    };
    MemoryCacheStorage.prototype.delete = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.store.delete(key);
                return [2 /*return*/];
            });
        });
    };
    MemoryCacheStorage.prototype.setMany = function (items) {
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
    MemoryCacheStorage.prototype.getMany = function (keys) {
        return __awaiter(this, void 0, void 0, function () {
            var results, now, _i, keys_1, key, entry;
            return __generator(this, function (_a) {
                results = new Map();
                now = new Date();
                for (_i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
                    key = keys_1[_i];
                    entry = this.store.get(key);
                    if (!entry)
                        continue;
                    // Check if expired
                    if (entry.expiresAt && new Date(entry.expiresAt) < now) {
                        this.store.delete(key);
                        continue;
                    }
                    results.set(key, __assign({}, entry));
                }
                return [2 /*return*/, results];
            });
        });
    };
    MemoryCacheStorage.prototype.deleteMany = function (keys) {
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
    MemoryCacheStorage.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.store.clear();
                return [2 /*return*/];
            });
        });
    };
    MemoryCacheStorage.prototype.keys = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, Array.from(this.store.keys())];
            });
        });
    };
    MemoryCacheStorage.prototype.size = function () {
        return __awaiter(this, void 0, void 0, function () {
            var totalSize, _i, _a, entry;
            var _b;
            return __generator(this, function (_c) {
                totalSize = 0;
                for (_i = 0, _a = this.store.values(); _i < _a.length; _i++) {
                    entry = _a[_i];
                    if ((_b = entry.metadata) === null || _b === void 0 ? void 0 : _b.size) {
                        totalSize += entry.metadata.size;
                    }
                    else {
                        // Estimate
                        if (typeof entry.content === 'string') {
                            totalSize += entry.content.length * 2;
                        }
                    }
                }
                return [2 /*return*/, totalSize];
            });
        });
    };
    MemoryCacheStorage.prototype.count = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.store.size];
            });
        });
    };
    MemoryCacheStorage.prototype.prune = function () {
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
    // Testing helpers
    MemoryCacheStorage.prototype.reset = function () {
        this.store.clear();
    };
    MemoryCacheStorage.prototype.getSize = function () {
        return this.store.size;
    };
    return MemoryCacheStorage;
}());
exports.MemoryCacheStorage = MemoryCacheStorage;
