"use strict";
/**
 * TranslationNotesLoader - Loads Translation Notes resources
 * Implements ResourceLoader interface for plugin architecture
 *
 * Translation Notes provide translation guidance for specific phrases,
 * with links to Translation Academy articles for further training.
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
exports.TranslationNotesLoader = void 0;
var resource_catalog_1 = require("@bt-synergy/resource-catalog");
var resource_catalog_2 = require("@bt-synergy/resource-catalog");
var resource_parsers_1 = require("@bt-synergy/resource-parsers");
var TranslationNotesLoader = /** @class */ (function () {
    function TranslationNotesLoader(config) {
        var _a;
        this.resourceType = 'notes';
        this.cacheAdapter = config.cacheAdapter;
        this.catalogAdapter = config.catalogAdapter;
        this.door43Client = config.door43Client;
        this.debug = (_a = config.debug) !== null && _a !== void 0 ? _a : false;
        this.serverAdapter = new resource_catalog_2.Door43ServerAdapter();
        this.processor = new resource_parsers_1.NotesProcessor();
    }
    /**
     * Check if this loader can handle a resource
     */
    TranslationNotesLoader.prototype.canHandle = function (metadata) {
        return (metadata.type === 'notes' ||
            metadata.subject === 'TSV Translation Notes' ||
            metadata.resourceId === 'tn');
    };
    /**
     * Get resource metadata
     */
    TranslationNotesLoader.prototype.getMetadata = function (resourceKey) {
        return __awaiter(this, void 0, void 0, function () {
            var catalogMeta, identifiers, owner, language, resourceId, repoName, repo, metadata, error_1;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.catalogAdapter.get(resourceKey)];
                    case 1:
                        catalogMeta = _d.sent();
                        if (catalogMeta) {
                            return [2 /*return*/, catalogMeta];
                        }
                        identifiers = this.serverAdapter.parseResourceKey(resourceKey);
                        owner = identifiers.owner, language = identifiers.language, resourceId = identifiers.resourceId;
                        repoName = "".concat(language, "_").concat(resourceId);
                        return [4 /*yield*/, this.door43Client.findRepository(owner, repoName, 'prod')];
                    case 2:
                        repo = _d.sent();
                        if (!repo) {
                            throw new Error("Resource not found: ".concat(owner, "/").concat(repoName));
                        }
                        // Only use release tag - throw if missing
                        if (!((_a = repo.release) === null || _a === void 0 ? void 0 : _a.tag_name)) {
                            throw new Error("Resource ".concat(owner, "/").concat(language, "/").concat(resourceId, " has no release tag. ") +
                                "Only released resources are currently supported.");
                        }
                        metadata = {
                            resourceKey: resourceKey,
                            server: 'git.door43.org',
                            owner: ((_b = repo.owner) === null || _b === void 0 ? void 0 : _b.login) || owner,
                            language: ((_c = repo.language) === null || _c === void 0 ? void 0 : _c.slug) || language,
                            resourceId: repo.name || resourceId,
                            type: resource_catalog_1.ResourceType.NOTES,
                            format: 'tsv',
                            contentType: 'text/tsv',
                            contentStructure: 'book',
                            subject: 'TSV Translation Notes',
                            version: repo.release.tag_name,
                            title: repo.title || "".concat(owner, "/").concat(language, "/").concat(resourceId),
                            description: repo.description,
                            availability: {
                                online: true,
                                offline: false,
                                bundled: false,
                                partial: false
                            },
                            locations: [],
                            release: repo.release,
                            catalogedAt: new Date().toISOString()
                        };
                        return [2 /*return*/, metadata];
                    case 3:
                        error_1 = _d.sent();
                        console.error("\u274C Failed to get metadata for ".concat(resourceKey, ":"), error_1);
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Load Translation Notes content for a specific book
     */
    TranslationNotesLoader.prototype.loadContent = function (resourceKey, bookCode) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, cached, metadata, parts, owner, language, resourceId, ref, repoName, tsvUrl, response, tsvContent, processed, error_2;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        cacheKey = "tn:".concat(resourceKey, ":").concat(bookCode);
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 8, , 9]);
                        return [4 /*yield*/, this.cacheAdapter.get(cacheKey)];
                    case 2:
                        cached = _b.sent();
                        if (cached) {
                            return [2 /*return*/, cached];
                        }
                        return [4 /*yield*/, this.getMetadata(resourceKey)
                            // Parse resourceKey to get identifiers
                        ];
                    case 3:
                        metadata = _b.sent();
                        parts = resourceKey.split('/');
                        owner = parts[0], language = parts[1], resourceId = parts[2];
                        ref = (_a = metadata.release) === null || _a === void 0 ? void 0 : _a.tag_name;
                        if (!ref) {
                            throw new Error("Resource ".concat(resourceKey, " has no release tag. ") +
                                "Only released resources are currently supported.");
                        }
                        repoName = "".concat(language, "_").concat(resourceId);
                        tsvUrl = "https://git.door43.org/".concat(owner, "/").concat(repoName, "/raw/tag/").concat(ref, "/tn_").concat(bookCode.toUpperCase(), ".tsv");
                        if (this.debug) {
                            console.log("\uD83D\uDCE5 Fetching TN TSV from: ".concat(tsvUrl));
                        }
                        return [4 /*yield*/, fetch(tsvUrl)];
                    case 4:
                        response = _b.sent();
                        if (!response.ok) {
                            // 404 means book doesn't exist in this repo (common for incomplete translations)
                            if (response.status === 404) {
                                if (this.debug) {
                                    console.log("\u26A0\uFE0F TN file not found (book not in repo): ".concat(bookCode));
                                }
                                // Return empty processed result so it gets cached and we don't retry
                                return [2 /*return*/, {
                                        bookCode: bookCode,
                                        bookName: bookCode,
                                        notes: [],
                                        notesByChapter: {},
                                        metadata: {
                                            bookCode: bookCode,
                                            bookName: bookCode,
                                            processingDate: new Date().toISOString(),
                                            totalNotes: 0,
                                            chaptersWithNotes: [],
                                            statistics: {
                                                totalNotes: 0,
                                                notesPerChapter: {}
                                            }
                                        }
                                    }];
                            }
                            throw new Error("Failed to fetch TSV: ".concat(response.statusText));
                        }
                        return [4 /*yield*/, response.text()
                            // Process TSV using NotesProcessor
                        ];
                    case 5:
                        tsvContent = _b.sent();
                        return [4 /*yield*/, this.processor.processNotes(tsvContent, bookCode, bookCode // Use bookCode as bookName for now
                            )
                            // Cache it
                        ];
                    case 6:
                        processed = _b.sent();
                        // Cache it
                        return [4 /*yield*/, this.cacheAdapter.set(cacheKey, processed)];
                    case 7:
                        // Cache it
                        _b.sent();
                        return [2 /*return*/, processed];
                    case 8:
                        error_2 = _b.sent();
                        if (this.debug) {
                            console.error("\u274C Failed to load content for ".concat(cacheKey, ":"), error_2);
                        }
                        throw error_2;
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Download entire Translation Notes resource (all books)
     */
    TranslationNotesLoader.prototype.downloadResource = function (resourceKey, options) {
        return __awaiter(this, void 0, void 0, function () {
            var skipExisting, onProgress, metadata, ingredients, total, loaded, _i, ingredients_1, ingredient, bookId, cacheKey, cached, error_3;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        skipExisting = (_a = options === null || options === void 0 ? void 0 : options.skipExisting) !== null && _a !== void 0 ? _a : true;
                        onProgress = options === null || options === void 0 ? void 0 : options.onProgress;
                        console.log("\uD83D\uDCE6 [TranslationNotesLoader] Starting download for ".concat(resourceKey));
                        return [4 /*yield*/, this.getMetadata(resourceKey)];
                    case 1:
                        metadata = _c.sent();
                        if (!metadata) {
                            throw new Error("Resource metadata not found for ".concat(resourceKey));
                        }
                        ingredients = (_b = metadata.contentMetadata) === null || _b === void 0 ? void 0 : _b.ingredients;
                        if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
                            console.warn("\u26A0\uFE0F No ingredients found for ".concat(resourceKey));
                            return [2 /*return*/];
                        }
                        console.log("\uD83D\uDCE6 Found ".concat(ingredients.length, " books to download"));
                        total = ingredients.length;
                        loaded = 0;
                        _i = 0, ingredients_1 = ingredients;
                        _c.label = 2;
                    case 2:
                        if (!(_i < ingredients_1.length)) return [3 /*break*/, 9];
                        ingredient = ingredients_1[_i];
                        bookId = ingredient.identifier;
                        if (!bookId) {
                            console.warn("\u26A0\uFE0F Skipping ingredient without identifier:", ingredient);
                            return [3 /*break*/, 8];
                        }
                        _c.label = 3;
                    case 3:
                        _c.trys.push([3, 7, , 8]);
                        if (!skipExisting) return [3 /*break*/, 5];
                        cacheKey = "tn:".concat(resourceKey, ":").concat(bookId);
                        return [4 /*yield*/, this.cacheAdapter.get(cacheKey)];
                    case 4:
                        cached = _c.sent();
                        if (cached && cached.notes) {
                            console.log("\u23ED\uFE0F Skipping ".concat(bookId, " (already cached)"));
                            loaded++;
                            if (onProgress) {
                                onProgress({
                                    loaded: loaded,
                                    total: total,
                                    percentage: Math.round((loaded / total) * 100),
                                    message: "Skipped ".concat(bookId, " (already cached)")
                                });
                            }
                            return [3 /*break*/, 8];
                        }
                        _c.label = 5;
                    case 5:
                        // Download and process this book
                        if (this.debug) {
                            console.log("\uD83D\uDCE5 Downloading TN for ".concat(bookId, "..."));
                        }
                        return [4 /*yield*/, this.loadContent(resourceKey, bookId)];
                    case 6:
                        _c.sent();
                        loaded++;
                        if (onProgress) {
                            onProgress({
                                loaded: loaded,
                                total: total,
                                percentage: Math.round((loaded / total) * 100),
                                message: "Downloaded ".concat(bookId)
                            });
                        }
                        return [3 /*break*/, 8];
                    case 7:
                        error_3 = _c.sent();
                        if (this.debug) {
                            console.warn("\u26A0\uFE0F Failed to download TN for ".concat(bookId, ":"), error_3);
                        }
                        // Continue with next book even if one fails
                        loaded++;
                        if (onProgress) {
                            onProgress({
                                loaded: loaded,
                                total: total,
                                percentage: Math.round((loaded / total) * 100),
                                message: "Skipped ".concat(bookId, " (not in repo)")
                            });
                        }
                        return [3 /*break*/, 8];
                    case 8:
                        _i++;
                        return [3 /*break*/, 2];
                    case 9:
                        if (this.debug) {
                            console.log("\u2705 [TranslationNotesLoader] Download complete for ".concat(resourceKey));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    return TranslationNotesLoader;
}());
exports.TranslationNotesLoader = TranslationNotesLoader;
