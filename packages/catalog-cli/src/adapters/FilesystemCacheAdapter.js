"use strict";
/**
 * Filesystem-based cache storage adapter
 * Stores content files directly on disk
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
exports.FilesystemCacheAdapter = void 0;
var fs = require("fs/promises");
var path = require("path");
var FilesystemCacheAdapter = /** @class */ (function () {
    function FilesystemCacheAdapter(cacheDir) {
        if (cacheDir === void 0) { cacheDir = './cache'; }
        this.cacheDir = cacheDir;
    }
    /**
     * Initialize cache directory
     */
    FilesystemCacheAdapter.prototype.ensureDir = function (subDir) {
        return __awaiter(this, void 0, void 0, function () {
            var dir;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        dir = subDir ? path.join(this.cacheDir, subDir) : this.cacheDir;
                        return [4 /*yield*/, fs.mkdir(dir, { recursive: true })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get file path for cached content
     */
    FilesystemCacheAdapter.prototype.getFilePath = function (key, contentType) {
        // key format: "owner/language/resourceId/bookId"
        // Create subdirectories for better organization
        var parts = key.split('/');
        // Determine file extension based on content type
        var ext = contentType === 'usfm-json' ? '.json' : '.txt';
        if (parts.length >= 3) {
            var owner = parts[0], language = parts[1], resourceId = parts[2], rest = parts.slice(3);
            var subDir = path.join(owner, language, resourceId);
            var fileName = rest.length > 0 ? rest.join('_') : 'content';
            return path.join(this.cacheDir, subDir, "".concat(fileName).concat(ext));
        }
        // Fallback for simple keys
        var safeKey = key.replace(/\//g, '_');
        return path.join(this.cacheDir, "".concat(safeKey).concat(ext));
    };
    /**
     * Set cached content (handles both string and object content)
     */
    FilesystemCacheAdapter.prototype.set = function (key, value) {
        return __awaiter(this, void 0, void 0, function () {
            var filePath, dir, contentToWrite, contentSize, metaPath;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        filePath = this.getFilePath(key, value.contentType);
                        dir = path.dirname(filePath);
                        // Ensure directory exists
                        return [4 /*yield*/, fs.mkdir(dir, { recursive: true })
                            // Determine if content needs to be stringified
                        ];
                    case 1:
                        // Ensure directory exists
                        _a.sent();
                        contentToWrite = typeof value.content === 'string'
                            ? value.content
                            : JSON.stringify(value.content, null, 2);
                        // Store content
                        return [4 /*yield*/, fs.writeFile(filePath, contentToWrite, 'utf-8')
                            // Calculate size
                        ];
                    case 2:
                        // Store content
                        _a.sent();
                        contentSize = typeof value.content === 'string'
                            ? value.content.length
                            : JSON.stringify(value.content).length;
                        metaPath = "".concat(filePath, ".meta.json");
                        return [4 /*yield*/, fs.writeFile(metaPath, JSON.stringify({
                                contentType: value.contentType,
                                cachedAt: value.cachedAt || new Date().toISOString(),
                                size: contentSize,
                                format: typeof value.content === 'string' ? 'text' : 'json'
                            }, null, 2), 'utf-8')];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get cached content
     */
    FilesystemCacheAdapter.prototype.get = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var jsonPath, jsonMetaPath, content, metaContent, meta, _a, textPath, textMetaPath, content, contentType, cachedAt, metaContent, meta, _b, error_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 11, , 12]);
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, , 10]);
                        jsonPath = this.getFilePath(key, 'usfm-json');
                        jsonMetaPath = "".concat(jsonPath, ".meta.json");
                        return [4 /*yield*/, fs.readFile(jsonPath, 'utf-8')];
                    case 2:
                        content = _c.sent();
                        return [4 /*yield*/, fs.readFile(jsonMetaPath, 'utf-8')];
                    case 3:
                        metaContent = _c.sent();
                        meta = JSON.parse(metaContent);
                        return [2 /*return*/, {
                                content: JSON.parse(content), // Parse JSON content
                                contentType: meta.contentType,
                                cachedAt: meta.cachedAt
                            }];
                    case 4:
                        _a = _c.sent();
                        textPath = this.getFilePath(key, 'usfm');
                        textMetaPath = "".concat(textPath, ".meta.json");
                        return [4 /*yield*/, fs.readFile(textPath, 'utf-8')];
                    case 5:
                        content = _c.sent();
                        contentType = 'text/plain';
                        cachedAt = void 0;
                        _c.label = 6;
                    case 6:
                        _c.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, fs.readFile(textMetaPath, 'utf-8')];
                    case 7:
                        metaContent = _c.sent();
                        meta = JSON.parse(metaContent);
                        contentType = meta.contentType || contentType;
                        cachedAt = meta.cachedAt;
                        return [3 /*break*/, 9];
                    case 8:
                        _b = _c.sent();
                        return [3 /*break*/, 9];
                    case 9: return [2 /*return*/, {
                            content: content, // Return as string
                            contentType: contentType,
                            cachedAt: cachedAt
                        }];
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        error_1 = _c.sent();
                        if (error_1.code === 'ENOENT') {
                            return [2 /*return*/, null];
                        }
                        throw error_1;
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check if content is cached
     */
    FilesystemCacheAdapter.prototype.has = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var filePath, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        filePath = this.getFilePath(key);
                        return [4 /*yield*/, fs.access(filePath)];
                    case 1:
                        _b.sent();
                        return [2 /*return*/, true];
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Delete cached content
     */
    FilesystemCacheAdapter.prototype.delete = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var filePath, metaPath, _a, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 6, , 7]);
                        filePath = this.getFilePath(key);
                        metaPath = "".concat(filePath, ".meta.json");
                        return [4 /*yield*/, fs.unlink(filePath)];
                    case 1:
                        _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, fs.unlink(metaPath)];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _a = _b.sent();
                        return [3 /*break*/, 5];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_2 = _b.sent();
                        if (error_2.code !== 'ENOENT') {
                            throw error_2;
                        }
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Clear all cached content
     */
    FilesystemCacheAdapter.prototype.clear = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        // Recursively delete cache directory
                        return [4 /*yield*/, fs.rm(this.cacheDir, { recursive: true, force: true })
                            // Recreate empty directory
                        ];
                    case 1:
                        // Recursively delete cache directory
                        _a.sent();
                        // Recreate empty directory
                        return [4 /*yield*/, this.ensureDir()];
                    case 2:
                        // Recreate empty directory
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _a.sent();
                        if (error_3.code !== 'ENOENT') {
                            throw error_3;
                        }
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get cache size (total bytes)
     */
    FilesystemCacheAdapter.prototype.getSize = function () {
        return __awaiter(this, void 0, void 0, function () {
            function calculateSize(dir) {
                return __awaiter(this, void 0, void 0, function () {
                    var size, entries, _i, entries_1, entry, fullPath, _a, stats, _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                size = 0;
                                _c.label = 1;
                            case 1:
                                _c.trys.push([1, 9, , 10]);
                                return [4 /*yield*/, fs.readdir(dir, { withFileTypes: true })];
                            case 2:
                                entries = _c.sent();
                                _i = 0, entries_1 = entries;
                                _c.label = 3;
                            case 3:
                                if (!(_i < entries_1.length)) return [3 /*break*/, 8];
                                entry = entries_1[_i];
                                fullPath = path.join(dir, entry.name);
                                if (!entry.isDirectory()) return [3 /*break*/, 5];
                                _a = size;
                                return [4 /*yield*/, calculateSize(fullPath)];
                            case 4:
                                size = _a + _c.sent();
                                return [3 /*break*/, 7];
                            case 5:
                                if (!entry.isFile()) return [3 /*break*/, 7];
                                return [4 /*yield*/, fs.stat(fullPath)];
                            case 6:
                                stats = _c.sent();
                                size += stats.size;
                                _c.label = 7;
                            case 7:
                                _i++;
                                return [3 /*break*/, 3];
                            case 8: return [3 /*break*/, 10];
                            case 9:
                                _b = _c.sent();
                                return [3 /*break*/, 10];
                            case 10: return [2 /*return*/, size];
                        }
                    });
                });
            }
            var totalSize;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        totalSize = 0;
                        return [4 /*yield*/, calculateSize(this.cacheDir)];
                    case 1:
                        totalSize = _a.sent();
                        return [2 /*return*/, totalSize];
                }
            });
        });
    };
    /**
     * Get number of cached items
     */
    FilesystemCacheAdapter.prototype.count = function () {
        return __awaiter(this, void 0, void 0, function () {
            function countFiles(dir) {
                return __awaiter(this, void 0, void 0, function () {
                    var fileCount, entries, _i, entries_2, entry, fullPath, _a, _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                fileCount = 0;
                                _c.label = 1;
                            case 1:
                                _c.trys.push([1, 8, , 9]);
                                return [4 /*yield*/, fs.readdir(dir, { withFileTypes: true })];
                            case 2:
                                entries = _c.sent();
                                _i = 0, entries_2 = entries;
                                _c.label = 3;
                            case 3:
                                if (!(_i < entries_2.length)) return [3 /*break*/, 7];
                                entry = entries_2[_i];
                                fullPath = path.join(dir, entry.name);
                                if (!entry.isDirectory()) return [3 /*break*/, 5];
                                _a = fileCount;
                                return [4 /*yield*/, countFiles(fullPath)];
                            case 4:
                                fileCount = _a + _c.sent();
                                return [3 /*break*/, 6];
                            case 5:
                                if (entry.isFile() && (entry.name.endsWith('.txt') || entry.name.endsWith('.json'))) {
                                    fileCount++;
                                }
                                _c.label = 6;
                            case 6:
                                _i++;
                                return [3 /*break*/, 3];
                            case 7: return [3 /*break*/, 9];
                            case 8:
                                _b = _c.sent();
                                return [3 /*break*/, 9];
                            case 9: return [2 /*return*/, fileCount];
                        }
                    });
                });
            }
            var count;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        count = 0;
                        return [4 /*yield*/, countFiles(this.cacheDir)];
                    case 1:
                        count = _a.sent();
                        return [2 /*return*/, count];
                }
            });
        });
    };
    return FilesystemCacheAdapter;
}());
exports.FilesystemCacheAdapter = FilesystemCacheAdapter;
