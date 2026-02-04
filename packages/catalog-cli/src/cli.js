#!/usr/bin/env node
"use strict";
/**
 * Catalog CLI - Command-line tool for managing resource catalogs
 *
 * Demonstrates library-level reusability of:
 * - @bt-synergy/catalog-manager
 * - @bt-synergy/scripture-loader
 * - @bt-synergy/door43-api
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
var commander_1 = require("commander");
var chalk_1 = require("chalk");
var ora_1 = require("ora");
var inquirer_1 = require("inquirer");
var catalog_manager_1 = require("@bt-synergy/catalog-manager");
var scripture_loader_1 = require("@bt-synergy/scripture-loader");
var door43_api_1 = require("@bt-synergy/door43-api");
var index_js_1 = require("./adapters/index.js");
var path = require("path");
var os = require("os");
// ============================================================================
// GLOBAL STATE
// ============================================================================
var DEFAULT_DATA_DIR = path.join(os.homedir(), '.catalog-cli');
var catalogManager;
/**
 * Initialize catalog manager with filesystem adapters
 */
function initCatalogManager(dataDir) {
    if (dataDir === void 0) { dataDir = DEFAULT_DATA_DIR; }
    var catalogDir = path.join(dataDir, 'catalog');
    var cacheDir = path.join(dataDir, 'cache');
    var catalogAdapter = new index_js_1.FilesystemCatalogAdapter(catalogDir);
    var cacheAdapter = new index_js_1.FilesystemCacheAdapter(cacheDir);
    var door43Client = new door43_api_1.Door43ApiClient({ debug: false });
    // Create catalog manager with proper typing
    var config = {
        catalogAdapter: catalogAdapter,
        cacheAdapter: cacheAdapter,
        door43Client: door43Client,
        debug: false
    };
    catalogManager = new catalog_manager_1.CatalogManager(config);
    // Register scripture loader
    var scriptureLoader = new scripture_loader_1.ScriptureLoader({
        cacheAdapter: cacheAdapter,
        catalogAdapter: catalogAdapter,
        door43Client: door43Client,
        debug: false
    });
    catalogManager.registerResourceType(scriptureLoader);
    return { catalogManager: catalogManager, catalogDir: catalogDir, cacheDir: cacheDir };
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return "".concat(parseFloat((bytes / Math.pow(k, i)).toFixed(2)), " ").concat(sizes[i]);
}
function formatResourceKey(resource) {
    return "".concat(resource.owner, "/").concat(resource.language, "/").concat(resource.id || resource.resourceId);
}
// ============================================================================
// COMMANDS
// ============================================================================
/**
 * Search for resources on Door43
 */
commander_1.program
    .command('search')
    .description('Search for resources on Door43')
    .option('-l, --language <code>', 'Filter by language code (e.g., en, es)')
    .option('-o, --owner <owner>', 'Filter by owner (e.g., unfoldingWord)')
    .option('-s, --subject <subject>', 'Filter by subject (e.g., Bible, Translation Notes)')
    .option('--limit <number>', 'Limit results', '20')
    .action(function (options) { return __awaiter(void 0, void 0, void 0, function () {
    var catalogManager, spinner, door43Client, filters, results, limit, displayed, _i, displayed_1, resource, key, error_1;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                catalogManager = initCatalogManager().catalogManager;
                spinner = (0, ora_1.default)('Searching Door43...').start();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                door43Client = new door43_api_1.Door43ApiClient({ debug: false });
                filters = {};
                if (options.language)
                    filters.lang = options.language;
                if (options.owner)
                    filters.owner = options.owner;
                if (options.subject)
                    filters.subject = options.subject;
                return [4 /*yield*/, door43Client.searchCatalog(filters)];
            case 2:
                results = _b.sent();
                spinner.succeed("Found ".concat(results.length, " resources"));
                if (results.length === 0) {
                    console.log(chalk_1.default.yellow('\nNo resources found. Try different filters.'));
                    return [2 /*return*/];
                }
                // Display results
                console.log(chalk_1.default.bold('\n📦 Search Results:\n'));
                limit = parseInt(options.limit);
                displayed = results.slice(0, limit);
                for (_i = 0, displayed_1 = displayed; _i < displayed_1.length; _i++) {
                    resource = displayed_1[_i];
                    key = formatResourceKey(resource);
                    console.log(chalk_1.default.cyan("  ".concat(key)));
                    console.log(chalk_1.default.gray("    ".concat(resource.title || resource.name)));
                    console.log(chalk_1.default.gray("    Subject: ".concat(resource.subject || 'N/A')));
                    console.log(chalk_1.default.gray("    Version: ".concat(resource.version || ((_a = resource.release) === null || _a === void 0 ? void 0 : _a.tag_name) || 'N/A')));
                    console.log();
                }
                if (results.length > limit) {
                    console.log(chalk_1.default.yellow("\n... and ".concat(results.length - limit, " more. Use --limit to see more.\n")));
                }
                console.log(chalk_1.default.dim("\n\uD83D\uDCA1 Tip: Use 'catalog-cli add <owner>/<language>/<resourceId>' to add a resource\n"));
                return [3 /*break*/, 4];
            case 3:
                error_1 = _b.sent();
                spinner.fail('Search failed');
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(error_1, "\n")));
                process.exit(1);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * Add resource to catalog
 */
commander_1.program
    .command('add <resourceKey>')
    .description('Add a resource to the catalog (format: owner/language/resourceId)')
    .option('--no-download', 'Add to catalog without downloading')
    .action(function (resourceKey, options) { return __awaiter(void 0, void 0, void 0, function () {
    var catalogManager, spinner, parts, owner, language, resourceId, door43Client, metadata, subject, fullMetadata, shouldDownload, downloadSpinner_1, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                catalogManager = initCatalogManager().catalogManager;
                spinner = (0, ora_1.default)("Adding ".concat(resourceKey, " to catalog...")).start();
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                parts = resourceKey.split('/');
                if (parts.length !== 3) {
                    throw new Error('Invalid resource key format. Expected: owner/language/resourceId');
                }
                owner = parts[0], language = parts[1], resourceId = parts[2];
                door43Client = new door43_api_1.Door43ApiClient({ debug: false });
                return [4 /*yield*/, door43Client.getResourceMetadata(owner, language, resourceId)];
            case 2:
                metadata = _a.sent();
                if (!metadata) {
                    throw new Error("Resource not found: ".concat(resourceKey));
                }
                subject = Array.isArray(metadata.subjects) && metadata.subjects.length > 0
                    ? metadata.subjects[0]
                    : 'Unknown';
                fullMetadata = {
                    resourceKey: resourceKey,
                    server: 'git.door43.org',
                    owner: owner,
                    language: language,
                    resourceId: resourceId,
                    title: metadata.fullName || metadata.title || resourceId.toUpperCase(),
                    subject: subject,
                    version: metadata.version || '1.0.0',
                    type: subject === 'Bible' || subject === 'Aligned Bible' ? 'scripture' : 'unknown',
                    format: 'usfm',
                    contentType: 'text/usfm',
                    availability: {
                        online: true,
                        offline: false,
                        bundled: false,
                        partial: false
                    },
                    locations: [{
                            type: 'network',
                            path: "git.door43.org/".concat(owner, "/").concat(language, "_").concat(resourceId),
                            priority: 1
                        }],
                    contentMetadata: {
                        ingredients: metadata.ingredients || [],
                        downloadedIngredients: [],
                        downloadStats: {
                            totalFiles: (metadata.ingredients || []).length,
                            downloadedFiles: 0,
                            totalSize: 0,
                            downloadedSize: 0
                        }
                    },
                    catalogedAt: new Date().toISOString()
                };
                // Add to catalog
                return [4 /*yield*/, catalogManager.addResourceToCatalog(fullMetadata)];
            case 3:
                // Add to catalog
                _a.sent();
                spinner.succeed("Added ".concat(resourceKey, " to catalog"));
                console.log(chalk_1.default.green("\n\u2705 Resource added successfully!\n"));
                console.log(chalk_1.default.gray("  Title: ".concat(fullMetadata.title)));
                console.log(chalk_1.default.gray("  Subject: ".concat(fullMetadata.subject)));
                console.log(chalk_1.default.gray("  Version: ".concat(fullMetadata.version)));
                console.log(chalk_1.default.gray("  Files: ".concat((metadata.ingredients || []).length)));
                if (!options.download) return [3 /*break*/, 6];
                console.log();
                return [4 /*yield*/, inquirer_1.default.prompt([{
                            type: 'confirm',
                            name: 'shouldDownload',
                            message: 'Download all files now?',
                            default: false
                        }])];
            case 4:
                shouldDownload = (_a.sent()).shouldDownload;
                if (!shouldDownload) return [3 /*break*/, 6];
                downloadSpinner_1 = (0, ora_1.default)('Downloading...').start();
                return [4 /*yield*/, catalogManager.downloadResource(resourceKey, {}, function (progress) {
                        downloadSpinner_1.text = "Downloading... ".concat(progress.percentage.toFixed(0), "% (").concat(progress.message, ")");
                    })];
            case 5:
                _a.sent();
                downloadSpinner_1.succeed('Download complete!');
                _a.label = 6;
            case 6:
                console.log(chalk_1.default.dim("\n\uD83D\uDCA1 Use 'catalog-cli download ".concat(resourceKey, "' to download files\n")));
                return [3 /*break*/, 8];
            case 7:
                error_2 = _a.sent();
                spinner.fail('Failed to add resource');
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(error_2, "\n")));
                process.exit(1);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
/**
 * List resources in catalog
 */
commander_1.program
    .command('list')
    .description('List all resources in the catalog')
    .option('-o, --offline', 'Show only offline (downloaded) resources')
    .option('-p, --partial', 'Show only partially downloaded resources')
    .action(function (options) { return __awaiter(void 0, void 0, void 0, function () {
    var catalogManager, spinner, resources, filtered, _i, filtered_1, resource, key, downloadedCount, totalCount, status_1, error_3;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                catalogManager = initCatalogManager().catalogManager;
                spinner = (0, ora_1.default)('Loading catalog...').start();
                _e.label = 1;
            case 1:
                _e.trys.push([1, 3, , 4]);
                return [4 /*yield*/, catalogManager.searchResources({})];
            case 2:
                resources = _e.sent();
                spinner.stop();
                if (resources.length === 0) {
                    console.log(chalk_1.default.yellow('\n📦 Catalog is empty\n'));
                    console.log(chalk_1.default.dim('💡 Use \'catalog-cli search\' to find resources\n'));
                    return [2 /*return*/];
                }
                filtered = resources;
                if (options.offline) {
                    filtered = resources.filter(function (r) { var _a, _b; return ((_a = r.availability) === null || _a === void 0 ? void 0 : _a.offline) && !((_b = r.availability) === null || _b === void 0 ? void 0 : _b.partial); });
                }
                else if (options.partial) {
                    filtered = resources.filter(function (r) { var _a; return (_a = r.availability) === null || _a === void 0 ? void 0 : _a.partial; });
                }
                console.log(chalk_1.default.bold("\n\uD83D\uDCE6 Catalog (".concat(filtered.length, " resources):\n")));
                for (_i = 0, filtered_1 = filtered; _i < filtered_1.length; _i++) {
                    resource = filtered_1[_i];
                    key = "".concat(resource.owner, "/").concat(resource.language, "/").concat(resource.resourceId);
                    downloadedCount = ((_b = (_a = resource.contentMetadata) === null || _a === void 0 ? void 0 : _a.downloadedIngredients) === null || _b === void 0 ? void 0 : _b.length) || 0;
                    totalCount = ((_d = (_c = resource.contentMetadata) === null || _c === void 0 ? void 0 : _c.ingredients) === null || _d === void 0 ? void 0 : _d.length) || 0;
                    status_1 = chalk_1.default.yellow('Not Downloaded');
                    if (resource.availability.offline && !resource.availability.partial) {
                        status_1 = chalk_1.default.green('✓ Complete');
                    }
                    else if (resource.availability.partial) {
                        status_1 = chalk_1.default.blue("\u2299 Partial (".concat(downloadedCount, "/").concat(totalCount, ")"));
                    }
                    console.log(chalk_1.default.cyan("  ".concat(key)) + " ".concat(status_1));
                    console.log(chalk_1.default.gray("    ".concat(resource.title)));
                    console.log(chalk_1.default.gray("    Subject: ".concat(resource.subject, " | Version: ").concat(resource.version)));
                    console.log();
                }
                console.log(chalk_1.default.dim("\uD83D\uDCA1 Use 'catalog-cli info <resourceKey>' for details\n"));
                return [3 /*break*/, 4];
            case 3:
                error_3 = _e.sent();
                spinner.fail('Failed to load catalog');
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(error_3, "\n")));
                process.exit(1);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * Show resource info and stats
 */
commander_1.program
    .command('info <resourceKey>')
    .description('Show detailed information about a resource')
    .action(function (resourceKey) { return __awaiter(void 0, void 0, void 0, function () {
    var catalogManager, metadata, stats, date, progress, ingredients, downloadedIngredients, displayLimit, displayed, _i, displayed_2, ing, isDownloaded, icon, size, error_4;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                catalogManager = initCatalogManager().catalogManager;
                _c.label = 1;
            case 1:
                _c.trys.push([1, 4, , 5]);
                return [4 /*yield*/, catalogManager.getResourceMetadata(resourceKey)];
            case 2:
                metadata = _c.sent();
                if (!metadata) {
                    console.error(chalk_1.default.red("\n\u274C Resource not found: ".concat(resourceKey, "\n")));
                    process.exit(1);
                }
                return [4 /*yield*/, catalogManager.getDownloadStats(resourceKey)];
            case 3:
                stats = _c.sent();
                console.log(chalk_1.default.bold("\n\uD83D\uDCD6 ".concat(metadata.title, "\n")));
                console.log(chalk_1.default.gray("  Key: ".concat(resourceKey)));
                console.log(chalk_1.default.gray("  Owner: ".concat(metadata.owner)));
                console.log(chalk_1.default.gray("  Language: ".concat(metadata.language)));
                console.log(chalk_1.default.gray("  Subject: ".concat(metadata.subject)));
                console.log(chalk_1.default.gray("  Version: ".concat(metadata.version)));
                console.log(chalk_1.default.gray("  Type: ".concat(metadata.type)));
                console.log(chalk_1.default.gray("  Format: ".concat(metadata.format)));
                if (stats) {
                    console.log();
                    console.log(chalk_1.default.bold('📊 Download Statistics:'));
                    console.log(chalk_1.default.gray("  Files: ".concat(stats.downloadedFiles, "/").concat(stats.totalFiles)));
                    if (stats.totalSize > 0) {
                        console.log(chalk_1.default.gray("  Size: ".concat(formatBytes(stats.downloadedSize), "/").concat(formatBytes(stats.totalSize))));
                    }
                    if (stats.lastDownload) {
                        date = new Date(stats.lastDownload);
                        console.log(chalk_1.default.gray("  Last Download: ".concat(date.toLocaleString())));
                    }
                    if (stats.downloadMethod) {
                        console.log(chalk_1.default.gray("  Method: ".concat(stats.downloadMethod)));
                    }
                    progress = stats.totalFiles > 0
                        ? ((stats.downloadedFiles / stats.totalFiles) * 100).toFixed(1)
                        : '0';
                    console.log(chalk_1.default.gray("  Progress: ".concat(progress, "%")));
                }
                ingredients = ((_a = metadata.contentMetadata) === null || _a === void 0 ? void 0 : _a.ingredients) || [];
                downloadedIngredients = ((_b = metadata.contentMetadata) === null || _b === void 0 ? void 0 : _b.downloadedIngredients) || [];
                if (ingredients.length > 0) {
                    console.log();
                    console.log(chalk_1.default.bold('📄 Files:'));
                    displayLimit = 10;
                    displayed = ingredients.slice(0, displayLimit);
                    for (_i = 0, displayed_2 = displayed; _i < displayed_2.length; _i++) {
                        ing = displayed_2[_i];
                        isDownloaded = downloadedIngredients.includes(ing.identifier);
                        icon = isDownloaded ? chalk_1.default.green('✓') : chalk_1.default.gray('○');
                        size = ing.size ? chalk_1.default.dim("(".concat(formatBytes(ing.size), ")")) : '';
                        console.log("  ".concat(icon, " ").concat(ing.identifier, " - ").concat(ing.title, " ").concat(size));
                    }
                    if (ingredients.length > displayLimit) {
                        console.log(chalk_1.default.dim("  ... and ".concat(ingredients.length - displayLimit, " more")));
                    }
                }
                console.log();
                return [3 /*break*/, 5];
            case 4:
                error_4 = _c.sent();
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(error_4, "\n")));
                process.exit(1);
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
/**
 * Download resource (all files)
 */
commander_1.program
    .command('download <resourceKey>')
    .description('Download all files for a resource')
    .option('-m, --method <method>', 'Download method: individual (default) or zip (faster)', 'individual')
    .action(function (resourceKey, options) { return __awaiter(void 0, void 0, void 0, function () {
    var catalogManager, method, methodLabel, spinner, error_5, errorMessage;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                catalogManager = initCatalogManager().catalogManager;
                method = options.method;
                if (method !== 'individual' && method !== 'zip') {
                    console.error(chalk_1.default.red("\n\u274C Invalid method: ".concat(method, ". Use 'individual' or 'zip'\n")));
                    process.exit(1);
                }
                methodLabel = method === 'zip' ? '(ZIP bulk)' : '(individual files)';
                spinner = (0, ora_1.default)("Downloading ".concat(resourceKey, " ").concat(methodLabel, "...")).start();
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, catalogManager.downloadResource(resourceKey, { method: method }, function (progress) {
                        spinner.text = "Downloading ".concat(resourceKey, "... ").concat(progress.percentage.toFixed(0), "% (").concat(progress.message, ")");
                    })];
            case 2:
                _a.sent();
                spinner.succeed("Downloaded ".concat(resourceKey));
                console.log(chalk_1.default.green("\n\u2705 All files downloaded successfully using ".concat(method, " method!\n")));
                return [3 /*break*/, 4];
            case 3:
                error_5 = _a.sent();
                spinner.fail('Download failed');
                errorMessage = error_5 instanceof Error ? error_5.message : JSON.stringify(error_5, null, 2);
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(errorMessage, "\n")));
                if (error_5 instanceof Error && error_5.stack) {
                    console.error(chalk_1.default.gray('\nStack trace:'));
                    console.error(chalk_1.default.gray(error_5.stack));
                }
                process.exit(1);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * Download specific ingredient
 */
commander_1.program
    .command('download-file <resourceKey> <ingredientId>')
    .description('Download a specific file/ingredient')
    .action(function (resourceKey, ingredientId) { return __awaiter(void 0, void 0, void 0, function () {
    var catalogManager, spinner, error_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                catalogManager = initCatalogManager().catalogManager;
                spinner = (0, ora_1.default)("Downloading ".concat(ingredientId, "...")).start();
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, catalogManager.downloadIngredient(resourceKey, ingredientId, {
                        onProgress: function (progress) {
                            spinner.text = "Downloading ".concat(ingredientId, "... ").concat(progress.toFixed(0), "%");
                        }
                    })];
            case 2:
                _a.sent();
                spinner.succeed("Downloaded ".concat(ingredientId));
                console.log(chalk_1.default.green("\n\u2705 File downloaded successfully!\n"));
                return [3 /*break*/, 4];
            case 3:
                error_6 = _a.sent();
                spinner.fail('Download failed');
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(error_6, "\n")));
                process.exit(1);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * Remove resource from catalog
 */
commander_1.program
    .command('remove <resourceKey>')
    .description('Remove a resource from the catalog')
    .option('--keep-cache', 'Keep downloaded files in cache')
    .action(function (resourceKey, options) { return __awaiter(void 0, void 0, void 0, function () {
    var catalogManager, confirmed, spinner, error_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                catalogManager = initCatalogManager().catalogManager;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                return [4 /*yield*/, inquirer_1.default.prompt([{
                            type: 'confirm',
                            name: 'confirmed',
                            message: "Remove ".concat(resourceKey, " from catalog?"),
                            default: false
                        }])];
            case 2:
                confirmed = (_a.sent()).confirmed;
                if (!confirmed) {
                    console.log(chalk_1.default.yellow('\nCancelled\n'));
                    return [2 /*return*/];
                }
                spinner = (0, ora_1.default)('Removing...').start();
                return [4 /*yield*/, catalogManager.removeResource(resourceKey)];
            case 3:
                _a.sent();
                spinner.succeed('Removed from catalog');
                console.log(chalk_1.default.green("\n\u2705 Resource removed successfully!\n"));
                return [3 /*break*/, 5];
            case 4:
                error_7 = _a.sent();
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(error_7, "\n")));
                process.exit(1);
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
/**
 * Export resource package for offline sharing
 */
commander_1.program
    .command('export <resourceKey>')
    .description('Export a resource as a ZIP package for offline sharing')
    .option('-o, --output <path>', 'Output file path (default: <resourceKey>.zip)')
    .action(function (resourceKey, options) { return __awaiter(void 0, void 0, void 0, function () {
    var catalogManager, JSZip, fs, path, spinner, metadata, zip, booksFolder, downloadedIngredients, addedBooks, _i, downloadedIngredients_1, ingredientId, cacheKey, cacheDir, resourcePath, bookPath, content, error_8, zipBlob, outputPath, sizeInMB, error_9, errorMessage;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                catalogManager = initCatalogManager().catalogManager;
                return [4 /*yield*/, Promise.resolve().then(function () { return require('jszip'); })];
            case 1:
                JSZip = (_c.sent()).default;
                return [4 /*yield*/, Promise.resolve().then(function () { return require('fs/promises'); })];
            case 2:
                fs = _c.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require('path'); })];
            case 3:
                path = _c.sent();
                spinner = (0, ora_1.default)("Exporting ".concat(resourceKey, "...")).start();
                _c.label = 4;
            case 4:
                _c.trys.push([4, 14, , 15]);
                return [4 /*yield*/, catalogManager.getResourceMetadata(resourceKey)];
            case 5:
                metadata = _c.sent();
                if (!metadata) {
                    throw new Error("Resource not found: ".concat(resourceKey));
                }
                // 2. Check if resource is downloaded
                if (!((_a = metadata.availability) === null || _a === void 0 ? void 0 : _a.offline)) {
                    spinner.fail('Export failed');
                    console.error(chalk_1.default.red("\n\u274C Resource not downloaded. Download it first with:\n"));
                    console.log(chalk_1.default.gray("   catalog-cli download ".concat(resourceKey, " --method zip\n")));
                    process.exit(1);
                }
                spinner.text = 'Creating ZIP package...';
                zip = new JSZip();
                // Add catalog metadata
                zip.file('catalog.json', JSON.stringify(metadata, null, 2));
                booksFolder = zip.folder('books');
                downloadedIngredients = ((_b = metadata.contentMetadata) === null || _b === void 0 ? void 0 : _b.downloadedIngredients) || [];
                addedBooks = 0;
                _i = 0, downloadedIngredients_1 = downloadedIngredients;
                _c.label = 6;
            case 6:
                if (!(_i < downloadedIngredients_1.length)) return [3 /*break*/, 11];
                ingredientId = downloadedIngredients_1[_i];
                cacheKey = "".concat(resourceKey, "/").concat(ingredientId);
                cacheDir = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.catalog-cli', 'cache');
                resourcePath = resourceKey.replace(/\//g, path.sep);
                bookPath = path.join(cacheDir, resourcePath, "".concat(ingredientId, ".json"));
                _c.label = 7;
            case 7:
                _c.trys.push([7, 9, , 10]);
                return [4 /*yield*/, fs.readFile(bookPath, 'utf-8')];
            case 8:
                content = _c.sent();
                booksFolder.file("".concat(ingredientId, ".json"), content);
                addedBooks++;
                spinner.text = "Adding books... ".concat(addedBooks, "/").concat(downloadedIngredients.length);
                return [3 /*break*/, 10];
            case 9:
                error_8 = _c.sent();
                console.warn(chalk_1.default.yellow("\u26A0\uFE0F  Skipped ".concat(ingredientId, ": not cached")));
                return [3 /*break*/, 10];
            case 10:
                _i++;
                return [3 /*break*/, 6];
            case 11:
                spinner.text = 'Generating ZIP file...';
                return [4 /*yield*/, zip.generateAsync({
                        type: 'nodebuffer',
                        compression: 'DEFLATE',
                        compressionOptions: { level: 9 }
                    })
                    // 6. Save to file
                ];
            case 12:
                zipBlob = _c.sent();
                outputPath = options.output || "".concat(resourceKey.replace(/\//g, '_'), ".zip");
                return [4 /*yield*/, fs.writeFile(outputPath, zipBlob)];
            case 13:
                _c.sent();
                sizeInMB = (zipBlob.length / 1024 / 1024).toFixed(2);
                spinner.succeed("Exported ".concat(resourceKey));
                console.log(chalk_1.default.green("\n\u2705 Resource package created successfully!\n"));
                console.log(chalk_1.default.gray("  File: ".concat(outputPath)));
                console.log(chalk_1.default.gray("  Size: ".concat(sizeInMB, " MB")));
                console.log(chalk_1.default.gray("  Books: ".concat(addedBooks)));
                console.log(chalk_1.default.dim("\n\uD83D\uDCA1 Share this file for offline use:\n   catalog-cli import ".concat(outputPath, "\n")));
                return [3 /*break*/, 15];
            case 14:
                error_9 = _c.sent();
                spinner.fail('Export failed');
                errorMessage = error_9 instanceof Error ? error_9.message : JSON.stringify(error_9, null, 2);
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(errorMessage, "\n")));
                if (error_9 instanceof Error && error_9.stack) {
                    console.error(chalk_1.default.gray('Stack trace:'));
                    console.error(chalk_1.default.gray(error_9.stack));
                }
                process.exit(1);
                return [3 /*break*/, 15];
            case 15: return [2 /*return*/];
        }
    });
}); });
/**
 * Import resource package from ZIP
 */
commander_1.program
    .command('import <zipFile>')
    .description('Import a resource package from ZIP file')
    .action(function (zipFile) { return __awaiter(void 0, void 0, void 0, function () {
    var catalogManager, JSZip, fs, path, spinner, zipData, zip, catalogFile, catalogJson, metadata, bookFiles, importedBooks, cacheDir, resourcePath, targetDir, _i, bookFiles_1, bookPath, bookFile, content, bookName, targetPath, error_10, errorMessage;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                catalogManager = initCatalogManager().catalogManager;
                return [4 /*yield*/, Promise.resolve().then(function () { return require('jszip'); })];
            case 1:
                JSZip = (_a.sent()).default;
                return [4 /*yield*/, Promise.resolve().then(function () { return require('fs/promises'); })];
            case 2:
                fs = _a.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require('path'); })];
            case 3:
                path = _a.sent();
                spinner = (0, ora_1.default)("Importing ".concat(zipFile, "...")).start();
                _a.label = 4;
            case 4:
                _a.trys.push([4, 16, , 17]);
                // 1. Read ZIP file
                spinner.text = 'Reading ZIP file...';
                return [4 /*yield*/, fs.readFile(zipFile)
                    // 2. Load ZIP
                ];
            case 5:
                zipData = _a.sent();
                // 2. Load ZIP
                spinner.text = 'Extracting ZIP...';
                return [4 /*yield*/, JSZip.loadAsync(zipData)
                    // 3. Read catalog metadata
                ];
            case 6:
                zip = _a.sent();
                catalogFile = zip.files['catalog.json'];
                if (!catalogFile) {
                    throw new Error('Invalid resource package: missing catalog.json');
                }
                return [4 /*yield*/, catalogFile.async('string')];
            case 7:
                catalogJson = _a.sent();
                metadata = JSON.parse(catalogJson);
                spinner.text = "Importing ".concat(metadata.title, "...");
                // 4. Add to catalog
                return [4 /*yield*/, catalogManager.addResourceToCatalog(metadata)
                    // 5. Extract and cache books
                ];
            case 8:
                // 4. Add to catalog
                _a.sent();
                bookFiles = Object.keys(zip.files).filter(function (path) { return path.startsWith('books/') && path.endsWith('.json'); });
                importedBooks = 0;
                cacheDir = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.catalog-cli', 'cache');
                resourcePath = metadata.resourceKey.replace(/\//g, path.sep);
                targetDir = path.join(cacheDir, resourcePath);
                // Create directory
                return [4 /*yield*/, fs.mkdir(targetDir, { recursive: true })];
            case 9:
                // Create directory
                _a.sent();
                _i = 0, bookFiles_1 = bookFiles;
                _a.label = 10;
            case 10:
                if (!(_i < bookFiles_1.length)) return [3 /*break*/, 15];
                bookPath = bookFiles_1[_i];
                bookFile = zip.files[bookPath];
                return [4 /*yield*/, bookFile.async('string')];
            case 11:
                content = _a.sent();
                bookName = path.basename(bookPath);
                targetPath = path.join(targetDir, bookName);
                // Write book content
                return [4 /*yield*/, fs.writeFile(targetPath, content, 'utf-8')
                    // Write metadata
                ];
            case 12:
                // Write book content
                _a.sent();
                // Write metadata
                return [4 /*yield*/, fs.writeFile(targetPath + '.meta.json', JSON.stringify({
                        contentType: 'usfm-json',
                        cachedAt: new Date().toISOString(),
                        size: content.length,
                        format: 'json'
                    }, null, 2), 'utf-8')];
            case 13:
                // Write metadata
                _a.sent();
                importedBooks++;
                spinner.text = "Importing books... ".concat(importedBooks, "/").concat(bookFiles.length);
                _a.label = 14;
            case 14:
                _i++;
                return [3 /*break*/, 10];
            case 15:
                spinner.succeed("Imported ".concat(metadata.title));
                console.log(chalk_1.default.green("\n\u2705 Resource package imported successfully!\n"));
                console.log(chalk_1.default.gray("  Resource: ".concat(metadata.resourceKey)));
                console.log(chalk_1.default.gray("  Books: ".concat(importedBooks)));
                console.log(chalk_1.default.dim("\n\uD83D\uDCA1 View details:\n   catalog-cli info ".concat(metadata.resourceKey, "\n")));
                return [3 /*break*/, 17];
            case 16:
                error_10 = _a.sent();
                spinner.fail('Import failed');
                errorMessage = error_10 instanceof Error ? error_10.message : JSON.stringify(error_10, null, 2);
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(errorMessage, "\n")));
                if (error_10 instanceof Error && error_10.stack) {
                    console.error(chalk_1.default.gray('Stack trace:'));
                    console.error(chalk_1.default.gray(error_10.stack));
                }
                process.exit(1);
                return [3 /*break*/, 17];
            case 17: return [2 /*return*/];
        }
    });
}); });
/**
 * Show catalog stats
 */
commander_1.program
    .command('stats')
    .description('Show catalog statistics')
    .action(function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, catalogManager, catalogDir, cacheDir, spinner, stats, _i, _b, _c, subject, count, languages, _d, languages_1, _e, lang, count, error_11;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                _a = initCatalogManager(), catalogManager = _a.catalogManager, catalogDir = _a.catalogDir, cacheDir = _a.cacheDir;
                spinner = (0, ora_1.default)('Calculating stats...').start();
                _f.label = 1;
            case 1:
                _f.trys.push([1, 3, , 4]);
                return [4 /*yield*/, catalogManager.getCatalogStats()];
            case 2:
                stats = _f.sent();
                spinner.stop();
                console.log(chalk_1.default.bold('\n📊 Catalog Statistics:\n'));
                console.log(chalk_1.default.gray("  Total Resources: ".concat(stats.totalResources)));
                console.log(chalk_1.default.gray("  Languages: ".concat(stats.totalLanguages)));
                console.log(chalk_1.default.gray("  Owners: ".concat(stats.totalOwners)));
                console.log();
                if ('availableOffline' in stats) {
                    console.log(chalk_1.default.gray("  Available Offline: ".concat(stats.availableOffline || 0)));
                }
                if ('availableOnline' in stats) {
                    console.log(chalk_1.default.gray("  Available Online: ".concat(stats.availableOnline || 0)));
                }
                if (Object.keys(stats.bySubject).length > 0) {
                    console.log();
                    console.log(chalk_1.default.bold('By Subject:'));
                    for (_i = 0, _b = Object.entries(stats.bySubject); _i < _b.length; _i++) {
                        _c = _b[_i], subject = _c[0], count = _c[1];
                        console.log(chalk_1.default.gray("  ".concat(subject, ": ").concat(count)));
                    }
                }
                if (Object.keys(stats.byLanguage).length > 0) {
                    console.log();
                    console.log(chalk_1.default.bold('By Language:'));
                    languages = Object.entries(stats.byLanguage).slice(0, 5);
                    for (_d = 0, languages_1 = languages; _d < languages_1.length; _d++) {
                        _e = languages_1[_d], lang = _e[0], count = _e[1];
                        console.log(chalk_1.default.gray("  ".concat(lang, ": ").concat(count)));
                    }
                    if (Object.keys(stats.byLanguage).length > 5) {
                        console.log(chalk_1.default.dim("  ... and ".concat(Object.keys(stats.byLanguage).length - 5, " more")));
                    }
                }
                console.log();
                console.log(chalk_1.default.dim("Catalog Dir: ".concat(catalogDir)));
                console.log(chalk_1.default.dim("Cache Dir: ".concat(cacheDir)));
                console.log();
                return [3 /*break*/, 4];
            case 3:
                error_11 = _f.sent();
                spinner.fail('Failed to get stats');
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(error_11, "\n")));
                process.exit(1);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * Clear catalog and/or cache
 */
commander_1.program
    .command('clear')
    .description('Clear catalog and/or cache')
    .option('--catalog', 'Clear catalog only')
    .option('--cache', 'Clear cache only')
    .action(function (options) { return __awaiter(void 0, void 0, void 0, function () {
    var catalogManager, clearCatalog, clearCache, message, confirmed, spinner, catalogAdapter, error_12;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                catalogManager = initCatalogManager().catalogManager;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 9, , 10]);
                clearCatalog = options.catalog || (!options.catalog && !options.cache);
                clearCache = options.cache || (!options.catalog && !options.cache);
                message = clearCatalog && clearCache
                    ? 'Clear both catalog and cache?'
                    : clearCatalog
                        ? 'Clear catalog (keep cache)?'
                        : 'Clear cache (keep catalog)?';
                return [4 /*yield*/, inquirer_1.default.prompt([{
                            type: 'confirm',
                            name: 'confirmed',
                            message: message,
                            default: false
                        }])];
            case 2:
                confirmed = (_a.sent()).confirmed;
                if (!confirmed) {
                    console.log(chalk_1.default.yellow('\nCancelled\n'));
                    return [2 /*return*/];
                }
                spinner = (0, ora_1.default)('Clearing...').start();
                if (!(clearCatalog && clearCache)) return [3 /*break*/, 4];
                return [4 /*yield*/, catalogManager.clearAll()];
            case 3:
                _a.sent();
                spinner.succeed('Cleared catalog and cache');
                return [3 /*break*/, 8];
            case 4:
                if (!clearCache) return [3 /*break*/, 6];
                return [4 /*yield*/, catalogManager.clearCache()];
            case 5:
                _a.sent();
                spinner.succeed('Cleared cache');
                return [3 /*break*/, 8];
            case 6:
                catalogAdapter = catalogManager.catalogAdapter;
                return [4 /*yield*/, catalogAdapter.clear()];
            case 7:
                _a.sent();
                spinner.succeed('Cleared catalog');
                _a.label = 8;
            case 8:
                console.log(chalk_1.default.green('\n✅ Cleared successfully!\n'));
                return [3 /*break*/, 10];
            case 9:
                error_12 = _a.sent();
                console.error(chalk_1.default.red("\n\u274C Error: ".concat(error_12, "\n")));
                process.exit(1);
                return [3 /*break*/, 10];
            case 10: return [2 /*return*/];
        }
    });
}); });
// ============================================================================
// MAIN
// ============================================================================
commander_1.program
    .name('catalog-cli')
    .description('CLI tool for managing resource catalogs and downloads')
    .version('1.0.0');
commander_1.program.parse();
