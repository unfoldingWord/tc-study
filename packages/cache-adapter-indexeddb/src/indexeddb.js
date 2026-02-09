"use strict";
/**
 * IndexedDB Storage Adapter
 *
 * Browser-based persistent storage using IndexedDB.
 * Book-organized resources (scripture, TN, TQ) are stored as one manifest + one record per chapter
 * to avoid large single-entry size limits on mobile. TA, TW, and other keys are stored as single records.
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
var bookChunkedStorage_1 = require("./bookChunkedStorage");
/**
 * IndexedDB adapter for web browsers. Book-organized resources (scripture, TN, TQ) are stored as manifest + chapter entries.
 * API-compatible with CacheStorageAdapter (get/set/has/delete/keys/size/count etc.).
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
            var _a, manifestEntry_1, chapterEntries_1, db_1, store;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!(0, bookChunkedStorage_1.canSplitBookEntry)(key, entry)) return [3 /*break*/, 2];
                        _a = (0, bookChunkedStorage_1.splitBookEntry)(key, entry), manifestEntry_1 = _a.manifestEntry, chapterEntries_1 = _a.chapterEntries;
                        if (typeof console !== 'undefined' && console.log) {
                            console.log('[cache-adapter-indexeddb] Storing book as chapter entries:', key, "(".concat(chapterEntries_1.length, " chapters)"));
                        }
                        return [4 /*yield*/, this.initDB()];
                    case 1:
                        db_1 = _b.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var tx = db_1.transaction(_this.storeName, 'readwrite');
                                var store = tx.objectStore(_this.storeName);
                                store.put({ key: key, entry: manifestEntry_1 });
                                for (var _i = 0, chapterEntries_2 = chapterEntries_1; _i < chapterEntries_2.length; _i++) {
                                    var _a = chapterEntries_2[_i], chKey = _a.key, chEntry = _a.entry;
                                    store.put({ key: chKey, entry: chEntry });
                                }
                                tx.oncomplete = function () { return resolve(); };
                                tx.onerror = function () { return reject(tx.error); };
                            })];
                    case 2: return [4 /*yield*/, this.getStore('readwrite')];
                    case 3:
                        store = _b.sent();
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
            var store, result, db, chapterRecords;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readonly')];
                    case 1:
                        store = _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var request = store.get(key);
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () { var _a; return resolve((_a = request.result) !== null && _a !== void 0 ? _a : null); };
                            })];
                    case 2:
                        result = _a.sent();
                        if (!result)
                            return [2 /*return*/, null];
                        if (!(result.entry.expiresAt && new Date(result.entry.expiresAt) < new Date())) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.delete(key)];
                    case 3:
                        _a.sent();
                        return [2 /*return*/, null];
                    case 4:
                        if (!(0, bookChunkedStorage_1.isChunkedManifest)(result.entry))
                            return [2 /*return*/, result.entry];
                        return [4 /*yield*/, this.initDB()];
                    case 5:
                        db = _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var tx = db.transaction(_this.storeName, 'readonly');
                                var st = tx.objectStore(_this.storeName);
                                var range = IDBKeyRange.bound(key + ':', key + ':\uffff');
                                var request = st.getAll(range);
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () {
                                    var rows = request.result;
                                    resolve(rows !== null && rows !== void 0 ? rows : []);
                                };
                            })];
                    case 6:
                        chapterRecords = _a.sent();
                        return [2 /*return*/, (0, bookChunkedStorage_1.reassembleBookEntry)(key, result.entry, chapterRecords.map(function (r) { return ({ key: r.key, entry: r.entry }); }))];
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
            var db;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initDB()];
                    case 1:
                        db = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var tx = db.transaction(_this.storeName, 'readwrite');
                                var store = tx.objectStore(_this.storeName);
                                store.delete(key);
                                if ((0, bookChunkedStorage_1.isBookOrganizedKey)(key)) {
                                    var range = IDBKeyRange.bound(key + ':', key + ':\uffff');
                                    var cursorRequest_1 = store.openCursor(range);
                                    cursorRequest_1.onerror = function () { return reject(cursorRequest_1.error); };
                                    cursorRequest_1.onsuccess = function () {
                                        var cursor = cursorRequest_1.result;
                                        if (cursor) {
                                            cursor.delete();
                                            cursor.continue();
                                        }
                                    };
                                }
                                tx.oncomplete = function () { return resolve(); };
                                tx.onerror = function () { return reject(tx.error); };
                            })];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.setMany = function (items) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, items_1, item;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _i = 0, items_1 = items;
                        _a.label = 1;
                    case 1:
                        if (!(_i < items_1.length)) return [3 /*break*/, 4];
                        item = items_1[_i];
                        return [4 /*yield*/, this.set(item.key, item.entry)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
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
            var _i, keys_2, key;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _i = 0, keys_2 = keys;
                        _a.label = 1;
                    case 1:
                        if (!(_i < keys_2.length)) return [3 /*break*/, 4];
                        key = keys_2[_i];
                        return [4 /*yield*/, this.delete(key)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
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
            var store, allKeys, logicalKeys;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getStore('readonly')];
                    case 1:
                        store = _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var request = store.getAllKeys();
                                request.onerror = function () { return reject(request.error); };
                                request.onsuccess = function () { return resolve(request.result); };
                            })];
                    case 2:
                        allKeys = _a.sent();
                        logicalKeys = allKeys.map(function (k) { return ((0, bookChunkedStorage_1.isChapterSubKey)(k) ? (0, bookChunkedStorage_1.toLogicalKey)(k) : k); });
                        return [2 /*return*/, Array.from(new Set(logicalKeys))];
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
            var logicalKeys;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.keys()];
                    case 1:
                        logicalKeys = _a.sent();
                        return [2 /*return*/, logicalKeys.length];
                }
            });
        });
    };
    IndexedDBCacheAdapter.prototype.prune = function () {
        return __awaiter(this, void 0, void 0, function () {
            var logicalKeys, now, pruned, _i, logicalKeys_1, key, entry;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.keys()];
                    case 1:
                        logicalKeys = _a.sent();
                        now = new Date();
                        pruned = 0;
                        _i = 0, logicalKeys_1 = logicalKeys;
                        _a.label = 2;
                    case 2:
                        if (!(_i < logicalKeys_1.length)) return [3 /*break*/, 6];
                        key = logicalKeys_1[_i];
                        return [4 /*yield*/, this.get(key)];
                    case 3:
                        entry = _a.sent();
                        if (!((entry === null || entry === void 0 ? void 0 : entry.expiresAt) && new Date(entry.expiresAt) < now)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.delete(key)];
                    case 4:
                        _a.sent();
                        pruned++;
                        _a.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 2];
                    case 6: return [2 /*return*/, pruned];
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
