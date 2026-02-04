"use strict";
/**
 * IndexedDB Storage Adapter
 *
 * Browser-based persistent storage using IndexedDB
 */
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
exports.IndexedDBCacheAdapter = void 0;
/**
 * IndexedDB adapter for web browsers
 * Provides persistent cache storage
 */
var IndexedDBCacheAdapter = /** @class */ (function () {
    function IndexedDBCacheAdapter(options) {
        if (options === void 0) { options = {}; }
        this.db = null;
        this.dbName = options.dbName || 'resource-cache';
        this.storeName = options.storeName || 'cache-entries';
        this.version = options.version || 1;
    }
    IndexedDBCacheAdapter.prototype.initDB = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                if (this.db)
                    return [2 /*return*/, this.db];
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var request = indexedDB.open(_this.dbName, _this.version);
                        request.onerror = function () { return reject(request.error); };
                        request.onsuccess = function () {
                            _this.db = request.result;
                            resolve(request.result);
                        };
                        request.onupgradeneeded = function (event) {
                            var db = event.target.result;
                            if (!db.objectStoreNames.contains(_this.storeName)) {
                                var store = db.createObjectStore(_this.storeName, { keyPath: 'key' });
                                store.createIndex('expiresAt', 'entry.expiresAt', { unique: false });
                            }
                        };
                    })];
            });
        });
    };
    IndexedDBCacheAdapter.prototype.getStore = function (mode) {
        return __awaiter(this, void 0, void 0, function () {
            var db, transaction;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initDB()];
                    case 1:
                        db = _a.sent();
                        transaction = db.transaction(this.storeName, mode);
                        return [2 /*return*/, transaction.objectStore(this.storeName)];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.set = function (key, entry) {
        return __awaiter(this, void 0, void 0, function () {
            var store;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readwrite')];
                    case 1:
                        store = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var request = store.put({ key: key, entry: entry });
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () { return resolve(); };
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.get = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var store;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readonly')];
                    case 1:
                        store = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var request = store.get(key);
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () {
                                    var result = request.result;
                                    if (!result) {
                                        resolve(null);
                                        return;
                                    }
                                    // Check if expired
                                    if (result.entry.expiresAt && new Date(result.entry.expiresAt) < new Date()) {
                                        // Delete expired entry
                                        _this.delete(key).then(function () { return resolve(null); });
                                        return;
                                    }
                                    resolve(result.entry);
                                };
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.has = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var entry;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.get(key)];
                    case 1:
                        entry = _a.sent();
                        return [2 /*return*/, entry !== null];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.delete = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var store;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readwrite')];
                    case 1:
                        store = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var request = store.delete(key);
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () { return resolve(); };
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.setMany = function (items) {
        return __awaiter(this, void 0, void 0, function () {
            var store;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readwrite')];
                    case 1:
                        store = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var completed = 0;
                                var hasError = false;
                                if (items.length === 0) {
                                    resolve();
                                    return;
                                }
                                var _loop_1 = function (item) {
                                    if (hasError)
                                        return "break";
                                    var request = store.put({ key: item.key, entry: item.entry });
                                    request.onerror = function () {
                                        if (!hasError) {
                                            hasError = true;
                                            reject(request.error);
                                        }
                                    };
                                    request.onsuccess = function () {
                                        completed++;
                                        if (completed === items.length) {
                                            resolve();
                                        }
                                    };
                                };
                                for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
                                    var item = items_1[_i];
                                    var state_1 = _loop_1(item);
                                    if (state_1 === "break")
                                        break;
                                }
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.getMany = function (keys) {
        return __awaiter(this, void 0, void 0, function () {
            var results, now, _i, keys_1, key, entry;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        results = new Map();
                        now = new Date();
                        _i = 0, keys_1 = keys;
                        _a.label = 1;
                    case 1:
                        if (!(_i < keys_1.length)) return [3 /*break*/, 4];
                        key = keys_1[_i];
                        return [4 /*yield*/, this.get(key)];
                    case 2:
                        entry = _a.sent();
                        if (entry) {
                            results.set(key, entry);
                        }
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, results];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.deleteMany = function (keys) {
        return __awaiter(this, void 0, void 0, function () {
            var store;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readwrite')];
                    case 1:
                        store = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var completed = 0;
                                var hasError = false;
                                if (keys.length === 0) {
                                    resolve();
                                    return;
                                }
                                var _loop_2 = function (key) {
                                    if (hasError)
                                        return "break";
                                    var request = store.delete(key);
                                    request.onerror = function () {
                                        if (!hasError) {
                                            hasError = true;
                                            reject(request.error);
                                        }
                                    };
                                    request.onsuccess = function () {
                                        completed++;
                                        if (completed === keys.length) {
                                            resolve();
                                        }
                                    };
                                };
                                for (var _i = 0, keys_2 = keys; _i < keys_2.length; _i++) {
                                    var key = keys_2[_i];
                                    var state_2 = _loop_2(key);
                                    if (state_2 === "break")
                                        break;
                                }
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            var store;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readwrite')];
                    case 1:
                        store = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var request = store.clear();
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () { return resolve(); };
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.keys = function () {
        return __awaiter(this, void 0, void 0, function () {
            var store;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readonly')];
                    case 1:
                        store = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var request = store.getAllKeys();
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () { return resolve(request.result); };
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.size = function () {
        return __awaiter(this, void 0, void 0, function () {
            var store;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readonly')];
                    case 1:
                        store = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var request = store.getAll();
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () {
                                    var _a;
                                    var totalSize = 0;
                                    for (var _i = 0, _b = request.result; _i < _b.length; _i++) {
                                        var item = _b[_i];
                                        var entry = item.entry;
                                        if ((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.size) {
                                            totalSize += entry.metadata.size;
                                        }
                                    }
                                    resolve(totalSize);
                                };
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.count = function () {
        return __awaiter(this, void 0, void 0, function () {
            var store;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readonly')];
                    case 1:
                        store = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var request = store.count();
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () { return resolve(request.result); };
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.prune = function () {
        return __awaiter(this, void 0, void 0, function () {
            var store, now;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readwrite')];
                    case 1:
                        store = _a.sent();
                        now = new Date();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var request = store.getAll();
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () {
                                    var items = request.result;
                                    var pruned = 0;
                                    for (var _i = 0, items_2 = items; _i < items_2.length; _i++) {
                                        var item = items_2[_i];
                                        if (item.entry.expiresAt && new Date(item.entry.expiresAt) < now) {
                                            store.delete(item.key);
                                            pruned++;
                                        }
                                    }
                                    resolve(pruned);
                                };
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.optimize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // IndexedDB handles optimization automatically
                    return [4 /*yield*/, this.prune()];
                    case 1:
                        // IndexedDB handles optimization automatically
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.db) {
                    this.db.close();
                    this.db = null;
                }
                return [2 /*return*/];
            });
        });
    };
    return IndexedDBCacheAdapter;
}());
exports.IndexedDBCacheAdapter = IndexedDBCacheAdapter;
