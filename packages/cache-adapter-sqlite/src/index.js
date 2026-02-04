"use strict";
/**
 * SQLite Cache Storage Adapter
 *
 * Persistent storage for mobile platforms using SQLite
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
exports.SQLiteCacheStorage = void 0;
/**
 * SQLite adapter for cache storage
 * Works with expo-sqlite, react-native-sqlite-storage, better-sqlite3
 */
var SQLiteCacheStorage = /** @class */ (function () {
    function SQLiteCacheStorage(database, tableName) {
        this.tableName = 'cache_entries';
        this.initialized = false;
        this.db = database;
        if (tableName) {
            this.tableName = tableName;
        }
    }
    /**
     * Initialize database (create tables and indexes)
     */
    SQLiteCacheStorage.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            var createTableSQL;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.initialized)
                            return [2 /*return*/];
                        createTableSQL = "\n      CREATE TABLE IF NOT EXISTS ".concat(this.tableName, " (\n        key TEXT PRIMARY KEY,\n        value BLOB NOT NULL,\n        size INTEGER NOT NULL,\n        createdAt INTEGER NOT NULL,\n        lastAccessed INTEGER NOT NULL,\n        accessCount INTEGER DEFAULT 1,\n        expiresAt INTEGER,\n        metadata TEXT\n      );\n      \n      CREATE INDEX IF NOT EXISTS idx_expires ON ").concat(this.tableName, "(expiresAt);\n      CREATE INDEX IF NOT EXISTS idx_accessed ON ").concat(this.tableName, "(lastAccessed);\n      CREATE INDEX IF NOT EXISTS idx_created ON ").concat(this.tableName, "(createdAt);\n    ");
                        return [4 /*yield*/, this.dbExec(createTableSQL)];
                    case 1:
                        _a.sent();
                        this.initialized = true;
                        return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================================
    // BASIC CRUD
    // ============================================================================
    SQLiteCacheStorage.prototype.save = function (key, entry) {
        return __awaiter(this, void 0, void 0, function () {
            var sql, params;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "\n      INSERT OR REPLACE INTO ".concat(this.tableName, " (\n        key, value, size, createdAt, lastAccessed, accessCount, expiresAt, metadata\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)\n    ");
                        params = [
                            key,
                            this.serializeValue(entry.value),
                            entry.size,
                            entry.createdAt,
                            entry.lastAccessed,
                            entry.accessCount,
                            entry.expiresAt || null,
                            entry.metadata ? JSON.stringify(entry.metadata) : null,
                        ];
                        return [4 /*yield*/, this.dbRun(sql, params)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    SQLiteCacheStorage.prototype.get = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var sql, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "SELECT * FROM ".concat(this.tableName, " WHERE key = ?");
                        return [4 /*yield*/, this.dbGetFirst(sql, [key])];
                    case 2:
                        row = _a.sent();
                        if (!row)
                            return [2 /*return*/, null
                                // Check if expired
                            ];
                        if (!(row.expiresAt && row.expiresAt < Date.now())) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.delete(key)];
                    case 3:
                        _a.sent();
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/, this.rowToEntry(row)];
                }
            });
        });
    };
    SQLiteCacheStorage.prototype.has = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var sql, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "\n      SELECT 1 FROM ".concat(this.tableName, " \n      WHERE key = ? AND (expiresAt IS NULL OR expiresAt > ?)\n      LIMIT 1\n    ");
                        return [4 /*yield*/, this.dbGetFirst(sql, [key, Date.now()])];
                    case 2:
                        row = _a.sent();
                        return [2 /*return*/, !!row];
                }
            });
        });
    };
    SQLiteCacheStorage.prototype.delete = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var sql;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "DELETE FROM ".concat(this.tableName, " WHERE key = ?");
                        return [4 /*yield*/, this.dbRun(sql, [key])];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    SQLiteCacheStorage.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sql;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "DELETE FROM ".concat(this.tableName);
                        return [4 /*yield*/, this.dbRun(sql)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    SQLiteCacheStorage.prototype.keys = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sql, rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "\n      SELECT key FROM ".concat(this.tableName, "\n      WHERE expiresAt IS NULL OR expiresAt > ?\n    ");
                        return [4 /*yield*/, this.dbGetAll(sql, [Date.now()])];
                    case 2:
                        rows = _a.sent();
                        return [2 /*return*/, rows.map(function (row) { return row.key; })];
                }
            });
        });
    };
    SQLiteCacheStorage.prototype.size = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sql, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "\n      SELECT COALESCE(SUM(size), 0) as totalSize \n      FROM ".concat(this.tableName, "\n      WHERE expiresAt IS NULL OR expiresAt > ?\n    ");
                        return [4 /*yield*/, this.dbGetFirst(sql, [Date.now()])];
                    case 2:
                        row = _a.sent();
                        return [2 /*return*/, (row === null || row === void 0 ? void 0 : row.totalSize) || 0];
                }
            });
        });
    };
    // ============================================================================
    // CACHE MANAGEMENT
    // ============================================================================
    SQLiteCacheStorage.prototype.getExpiredKeys = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sql, rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "\n      SELECT key FROM ".concat(this.tableName, "\n      WHERE expiresAt IS NOT NULL AND expiresAt <= ?\n    ");
                        return [4 /*yield*/, this.dbGetAll(sql, [Date.now()])];
                    case 2:
                        rows = _a.sent();
                        return [2 /*return*/, rows.map(function (row) { return row.key; })];
                }
            });
        });
    };
    SQLiteCacheStorage.prototype.updateAccessTime = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var sql;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "\n      UPDATE ".concat(this.tableName, "\n      SET lastAccessed = ?, accessCount = accessCount + 1\n      WHERE key = ?\n    ");
                        return [4 /*yield*/, this.dbRun(sql, [Date.now(), key])];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get entries sorted by last accessed (for LRU)
     */
    SQLiteCacheStorage.prototype.getEntriesByLRU = function (limit) {
        return __awaiter(this, void 0, void 0, function () {
            var sql, rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "\n      SELECT key, lastAccessed FROM ".concat(this.tableName, "\n      WHERE expiresAt IS NULL OR expiresAt > ?\n      ORDER BY lastAccessed ASC\n      ").concat(limit ? "LIMIT ".concat(limit) : '', "\n    ");
                        return [4 /*yield*/, this.dbGetAll(sql, [Date.now()])];
                    case 2:
                        rows = _a.sent();
                        return [2 /*return*/, rows];
                }
            });
        });
    };
    /**
     * Get entries sorted by access count (for LFU)
     */
    SQLiteCacheStorage.prototype.getEntriesByLFU = function (limit) {
        return __awaiter(this, void 0, void 0, function () {
            var sql, rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "\n      SELECT key, accessCount FROM ".concat(this.tableName, "\n      WHERE expiresAt IS NULL OR expiresAt > ?\n      ORDER BY accessCount ASC, lastAccessed ASC\n      ").concat(limit ? "LIMIT ".concat(limit) : '', "\n    ");
                        return [4 /*yield*/, this.dbGetAll(sql, [Date.now()])];
                    case 2:
                        rows = _a.sent();
                        return [2 /*return*/, rows];
                }
            });
        });
    };
    /**
     * Delete oldest entries by size (for eviction)
     */
    SQLiteCacheStorage.prototype.deleteOldestBySize = function (bytesToFree) {
        return __awaiter(this, void 0, void 0, function () {
            var sql, rows, freed, deleted, _i, rows_1, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "\n      SELECT key, size FROM ".concat(this.tableName, "\n      WHERE expiresAt IS NULL OR expiresAt > ?\n      ORDER BY lastAccessed ASC\n    ");
                        return [4 /*yield*/, this.dbGetAll(sql, [Date.now()])];
                    case 2:
                        rows = _a.sent();
                        freed = 0;
                        deleted = [];
                        _i = 0, rows_1 = rows;
                        _a.label = 3;
                    case 3:
                        if (!(_i < rows_1.length)) return [3 /*break*/, 6];
                        row = rows_1[_i];
                        if (freed >= bytesToFree)
                            return [3 /*break*/, 6];
                        return [4 /*yield*/, this.delete(row.key)];
                    case 4:
                        _a.sent();
                        freed += row.size;
                        deleted.push(row.key);
                        _a.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6: return [2 /*return*/, deleted];
                }
            });
        });
    };
    /**
     * Clean up expired entries
     */
    SQLiteCacheStorage.prototype.cleanup = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sql, result, _a, beforeCount, afterCount;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _b.sent();
                        sql = "\n      DELETE FROM ".concat(this.tableName, "\n      WHERE expiresAt IS NOT NULL AND expiresAt <= ?\n    ");
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 8]);
                        return [4 /*yield*/, this.dbRun(sql, [Date.now()])];
                    case 3:
                        result = _b.sent();
                        return [2 /*return*/, (result === null || result === void 0 ? void 0 : result.changes) || 0];
                    case 4:
                        _a = _b.sent();
                        return [4 /*yield*/, this.count()];
                    case 5:
                        beforeCount = _b.sent();
                        return [4 /*yield*/, this.dbRun(sql, [Date.now()])];
                    case 6:
                        _b.sent();
                        return [4 /*yield*/, this.count()];
                    case 7:
                        afterCount = _b.sent();
                        return [2 /*return*/, beforeCount - afterCount];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get total entry count
     */
    SQLiteCacheStorage.prototype.count = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sql, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        sql = "SELECT COUNT(*) as count FROM ".concat(this.tableName);
                        return [4 /*yield*/, this.dbGetFirst(sql)];
                    case 2:
                        row = _a.sent();
                        return [2 /*return*/, (row === null || row === void 0 ? void 0 : row.count) || 0];
                }
            });
        });
    };
    // ============================================================================
    // HELPERS
    // ============================================================================
    /**
     * Convert database row to CacheEntry
     */
    SQLiteCacheStorage.prototype.rowToEntry = function (row) {
        return {
            value: this.deserializeValue(row.value),
            size: row.size,
            createdAt: row.createdAt,
            lastAccessed: row.lastAccessed,
            accessCount: row.accessCount,
            expiresAt: row.expiresAt || undefined,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        };
    };
    /**
     * Check if Buffer is available (Node.js/React Native)
     */
    SQLiteCacheStorage.prototype.isBuffer = function (value) {
        return (value &&
            typeof value === 'object' &&
            typeof value.constructor === 'function' &&
            typeof value.constructor.isBuffer === 'function' &&
            value.constructor.isBuffer(value));
    };
    /**
     * Serialize value for storage
     * Supports strings, numbers, objects, ArrayBuffers, etc.
     */
    SQLiteCacheStorage.prototype.serializeValue = function (value) {
        if (typeof value === 'string') {
            return value;
        }
        if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
            // Store as-is (SQLite handles blobs)
            return value;
        }
        // Check for Buffer if available (Node.js/React Native)
        if (this.isBuffer(value)) {
            return value;
        }
        // For objects, arrays, etc., stringify
        return JSON.stringify(value);
    };
    /**
     * Deserialize value from storage
     */
    SQLiteCacheStorage.prototype.deserializeValue = function (value) {
        // Check for Buffer if available
        if (this.isBuffer(value)) {
            // Try to parse as JSON first
            try {
                var str = value.toString('utf-8');
                return JSON.parse(str);
            }
            catch (_a) {
                // Return as buffer/arraybuffer
                return value;
            }
        }
        // Handle Uint8Array/ArrayBuffer
        if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
            return value;
        }
        if (typeof value === 'string') {
            // Try to parse as JSON
            try {
                return JSON.parse(value);
            }
            catch (_b) {
                // Return as string
                return value;
            }
        }
        return value;
    };
    // ============================================================================
    // DATABASE HELPERS (works with multiple SQLite libraries)
    // ============================================================================
    SQLiteCacheStorage.prototype.dbExec = function (sql) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.db.execAsync) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.db.execAsync(sql)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        if (this.db.execSync) {
                            this.db.execSync(sql);
                        }
                        else {
                            throw new Error('Database does not support exec methods');
                        }
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    SQLiteCacheStorage.prototype.dbRun = function (sql, params) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.db.runAsync) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.db.runAsync(sql, params)];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        if (this.db.runSync) {
                            return [2 /*return*/, this.db.runSync(sql, params)];
                        }
                        else {
                            throw new Error('Database does not support run methods');
                        }
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    SQLiteCacheStorage.prototype.dbGetAll = function (sql, params) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.db.getAllAsync) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.db.getAllAsync(sql, params)];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        if (this.db.getAllSync) {
                            return [2 /*return*/, this.db.getAllSync(sql, params)];
                        }
                        else {
                            throw new Error('Database does not support getAll methods');
                        }
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    SQLiteCacheStorage.prototype.dbGetFirst = function (sql, params) {
        return __awaiter(this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.db.getFirstAsync) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.db.getFirstAsync(sql, params)];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        if (!this.db.getFirstSync) return [3 /*break*/, 3];
                        return [2 /*return*/, this.db.getFirstSync(sql, params)];
                    case 3: return [4 /*yield*/, this.dbGetAll(sql, params)];
                    case 4:
                        rows = _a.sent();
                        return [2 /*return*/, rows.length > 0 ? rows[0] : null];
                }
            });
        });
    };
    return SQLiteCacheStorage;
}());
exports.SQLiteCacheStorage = SQLiteCacheStorage;
