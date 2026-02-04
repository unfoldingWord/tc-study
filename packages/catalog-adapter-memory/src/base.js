"use strict";
/**
 * Base Storage Adapter
 *
 * Abstract base class for catalog storage implementations
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
exports.BaseCatalogAdapter = void 0;
/**
 * Base adapter with common query logic
 * Platform-specific adapters can extend this
 */
var BaseCatalogAdapter = /** @class */ (function () {
    function BaseCatalogAdapter() {
    }
    /**
     * Query resources by filters
     * Default implementation - subclasses can override for optimized queries
     */
    BaseCatalogAdapter.prototype.query = function (filters) {
        return __awaiter(this, void 0, void 0, function () {
            var all, resources;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAll()];
                    case 1:
                        all = _a.sent();
                        resources = Array.from(all.values());
                        return [2 /*return*/, resources.filter(function (resource) { return _this.matchesFilters(resource, filters); })];
                }
            });
        });
    };
    /**
     * Get catalog statistics
     * Default implementation - subclasses can override for optimized stats
     */
    BaseCatalogAdapter.prototype.getStats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var all, resources, servers, owners, languages, bySubject, byLanguage, byOwner, oldestDate, newestDate, _i, resources_1, resource;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAll()];
                    case 1:
                        all = _a.sent();
                        resources = Array.from(all.values());
                        servers = new Set();
                        owners = new Set();
                        languages = new Set();
                        bySubject = {};
                        byLanguage = {};
                        byOwner = {};
                        for (_i = 0, resources_1 = resources; _i < resources_1.length; _i++) {
                            resource = resources_1[_i];
                            servers.add(resource.server);
                            owners.add(resource.owner);
                            languages.add(resource.language);
                            // Count by subject
                            bySubject[resource.subject] = (bySubject[resource.subject] || 0) + 1;
                            // Count by language
                            byLanguage[resource.language] = (byLanguage[resource.language] || 0) + 1;
                            // Count by owner
                            byOwner[resource.owner] = (byOwner[resource.owner] || 0) + 1;
                            // Track oldest/newest
                            if (!oldestDate || resource.catalogedAt < oldestDate) {
                                oldestDate = resource.catalogedAt;
                            }
                            if (!newestDate || resource.catalogedAt > newestDate) {
                                newestDate = resource.catalogedAt;
                            }
                        }
                        return [2 /*return*/, {
                                totalResources: resources.length,
                                totalServers: servers.size,
                                totalOwners: owners.size,
                                totalLanguages: languages.size,
                                bySubject: bySubject,
                                byLanguage: byLanguage,
                                byOwner: byOwner,
                                oldestResource: oldestDate,
                                newestResource: newestDate,
                            }];
                }
            });
        });
    };
    /**
     * Check if resource matches filters
     */
    BaseCatalogAdapter.prototype.matchesFilters = function (resource, filters) {
        // Server filter
        if (filters.server) {
            var servers = Array.isArray(filters.server) ? filters.server : [filters.server];
            if (!servers.includes(resource.server))
                return false;
        }
        // Owner filter
        if (filters.owner) {
            var owners = Array.isArray(filters.owner) ? filters.owner : [filters.owner];
            if (!owners.includes(resource.owner))
                return false;
        }
        // Language filter
        if (filters.language) {
            var languages = Array.isArray(filters.language) ? filters.language : [filters.language];
            if (!languages.includes(resource.language))
                return false;
        }
        // Resource ID filter
        if (filters.resourceId) {
            var ids = Array.isArray(filters.resourceId) ? filters.resourceId : [filters.resourceId];
            if (!ids.includes(resource.resourceId))
                return false;
        }
        // Subject filter
        if (filters.subject) {
            var subjects = Array.isArray(filters.subject) ? filters.subject : [filters.subject];
            if (!subjects.includes(resource.subject))
                return false;
        }
        // Version filter
        if (filters.version && resource.version !== filters.version) {
            return false;
        }
        // Has books filter
        if (filters.hasBooks !== undefined) {
            var hasBooks = !!resource.books && resource.books.length > 0;
            if (hasBooks !== filters.hasBooks)
                return false;
        }
        // Has relations filter
        if (filters.hasRelations !== undefined) {
            var hasRelations = !!resource.relations && resource.relations.length > 0;
            if (hasRelations !== filters.hasRelations)
                return false;
        }
        return true;
    };
    return BaseCatalogAdapter;
}());
exports.BaseCatalogAdapter = BaseCatalogAdapter;
