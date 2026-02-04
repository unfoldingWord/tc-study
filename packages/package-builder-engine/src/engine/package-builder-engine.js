"use strict";
/**
 * Package Builder Engine
 *
 * Orchestrates the entire package building process:
 * 1. Download resources
 * 2. Parse content
 * 3. Build package structure
 * 4. Compress (optional)
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
exports.PackageBuilderEngine = void 0;
var resource_adapters_1 = require("@bt-synergy/resource-adapters");
var package_builder_1 = require("@bt-synergy/package-builder");
var downloader_1 = require("../downloader");
var builders_1 = require("../builders");
var compressors_1 = require("../compressors");
var filesystem_1 = require("../filesystem");
var PackageBuilderEngine = /** @class */ (function () {
    function PackageBuilderEngine(filesystem) {
        this.filesystem = filesystem || new filesystem_1.MemoryFileSystemAdapter();
        // Create pipeline with all adapters
        var pipeline = (0, resource_adapters_1.createDefaultPipeline)();
        // Initialize components
        this.downloader = new downloader_1.ResourceDownloader(pipeline);
        this.builder = new builders_1.PackageBuilder(this.filesystem);
        this.compressor = new compressors_1.ZipCompressor();
    }
    /**
     * Build a complete resource package
     */
    PackageBuilderEngine.prototype.buildPackage = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, errors, warnings, downloadRequests, contents, successfulContents, selectedResources, manifest, files, outputPath, config, zipData, totalSize, buildTime, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        errors = [];
                        warnings = [];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        downloadRequests = request.resources.map(function (_a) {
                            var resource = _a.resource, bookCode = _a.bookCode;
                            return ({
                                resource: resource,
                                options: { bookCode: bookCode, bookName: bookCode }
                            });
                        });
                        return [4 /*yield*/, this.downloader.downloadResources(downloadRequests, request.onProgress)
                            // Track errors
                        ];
                    case 2:
                        contents = _a.sent();
                        successfulContents = contents.filter(function (content, index) {
                            if (!content.data) {
                                errors.push({
                                    resource: request.resources[index].resource,
                                    bookCode: request.resources[index].bookCode,
                                    stage: 'download',
                                    error: new Error('Failed to download resource')
                                });
                                return false;
                            }
                            return true;
                        });
                        selectedResources = request.resources.map(function (r) { return r.resource; });
                        manifest = (0, package_builder_1.generateManifest)(selectedResources, {
                            languageInfo: request.languagesInfo
                        });
                        // Update manifest metadata
                        manifest.name = request.packageName;
                        manifest.version = request.packageVersion;
                        if (request.packageDescription) {
                            manifest.description = request.packageDescription;
                        }
                        return [4 /*yield*/, this.builder.buildPackage(manifest, successfulContents, request.packageName)
                            // 4. Compress (if requested)
                        ];
                    case 3:
                        files = _a.sent();
                        outputPath = void 0;
                        config = request.config || {};
                        if (!(config.outputFormat === 'zip')) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.compressor.compress(files)];
                    case 4:
                        zipData = _a.sent();
                        outputPath = "".concat(request.packageName, ".zip");
                        return [4 /*yield*/, this.filesystem.writeFile(outputPath, zipData)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        totalSize = Array.from(files.values()).reduce(function (sum, file) {
                            return sum + (typeof file === 'string' ? file.length : file.length);
                        }, 0);
                        buildTime = Date.now() - startTime;
                        return [2 /*return*/, {
                                success: errors.length === 0,
                                manifest: manifest,
                                outputPath: outputPath,
                                files: files,
                                errors: errors,
                                warnings: warnings,
                                stats: {
                                    totalResources: request.resources.length,
                                    successfulResources: successfulContents.length,
                                    failedResources: errors.length,
                                    totalSize: totalSize,
                                    buildTime: buildTime
                                }
                            }];
                    case 7:
                        error_1 = _a.sent();
                        throw new Error("Package build failed: ".concat(error_1 instanceof Error ? error_1.message : 'Unknown error'));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Quick build from manifest (assumes manifest already generated)
     */
    PackageBuilderEngine.prototype.buildFromManifest = function (manifest, onProgress) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, errors, resources;
            return __generator(this, function (_a) {
                startTime = Date.now();
                errors = [];
                resources = manifest.resources.map(function (entry) {
                    var _a;
                    return ({
                        resource: {
                            id: entry.id,
                            owner: entry.owner,
                            language: entry.language.code,
                            // Add other necessary Door43Resource fields
                        },
                        bookCode: (_a = entry.content.books) === null || _a === void 0 ? void 0 : _a[0] // First book if available
                    });
                });
                return [2 /*return*/, this.buildPackage({
                        packageName: manifest.name,
                        packageVersion: manifest.version,
                        packageDescription: manifest.description,
                        resources: resources,
                        onProgress: onProgress
                    })];
            });
        });
    };
    return PackageBuilderEngine;
}());
exports.PackageBuilderEngine = PackageBuilderEngine;
