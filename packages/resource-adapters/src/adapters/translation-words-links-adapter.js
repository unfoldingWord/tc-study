"use strict";
/**
 * Door43 Translation Words Links Adapter
 *
 * Fetches and parses TSV translation words links
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.TranslationWordsLinksAdapter = void 0;
var door43_api_1 = require("@bt-synergy/door43-api");
var base_adapter_1 = require("./base-adapter");
var TranslationWordsLinksAdapter = /** @class */ (function (_super) {
    __extends(TranslationWordsLinksAdapter, _super);
    function TranslationWordsLinksAdapter(httpClient) {
        return _super.call(this, httpClient) || this;
    }
    TranslationWordsLinksAdapter.prototype.getSupportedTypes = function () {
        return ['Translation Words Links', 'TSV Translation Words Links', 'translation-words-links'];
    };
    TranslationWordsLinksAdapter.prototype.fetchAndParse = function (resource_1) {
        return __awaiter(this, arguments, void 0, function (resource, options) {
            var bookCode, bookName, tsvUrl, tsvContent, links;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('[TWL Adapter] 🔄 fetchAndParse() called', { bookCode: options.bookCode, bookName: options.bookName, resourceId: resource === null || resource === void 0 ? void 0 : resource.resourceId });
                        bookCode = options.bookCode, bookName = options.bookName;
                        if (!bookCode) {
                            throw new Error('bookCode is required for translation words links');
                        }
                        tsvUrl = (0, door43_api_1.getWordsLinksUrl)(resource, bookCode);
                        console.log('[TWL Adapter] 📥 Downloading TSV from:', tsvUrl);
                        return [4 /*yield*/, this.downloadContent(tsvUrl)];
                    case 1:
                        tsvContent = _a.sent();
                        console.log('[TWL Adapter] ✅ Downloaded TSV, length:', tsvContent.length, 'chars');
                        links = this.parseTSV(tsvContent, bookCode, bookName || bookCode);
                        console.log('[TWL Adapter] ✅ Parsed', links.links.length, 'links');
                        return [2 /*return*/, this.createResult(links, resource, bookCode, bookName)];
                }
            });
        });
    };
    /**
     * Parse TSV content (simplified for now)
     */
    TranslationWordsLinksAdapter.prototype.parseTSV = function (tsvContent, bookCode, bookName) {
        var lines = tsvContent.split('\n').filter(function (line) { return line.trim(); });
        var links = lines.slice(1).map(function (line, index) {
            // TSV format: Reference, ID, Tags, OrigWords, Occurrence, TWLink
            var parts = line.split('\t');
            // Log first few lines to debug parsing
            if (index < 3) {
                console.log("[TWL Adapter] Parsing line ".concat(index + 1, ":"), {
                    partsCount: parts.length,
                    parts: parts,
                    reference: parts[0],
                    id: parts[1],
                    twLink: parts[5],
                });
            }
            var reference = parts[0], id = parts[1], tags = parts[2], origWords = parts[3], occurrence = parts[4], twLink = parts[5];
            // Warn if twLink is missing or empty (should be in 6th column)
            if (!twLink || !twLink.trim()) {
                console.warn("[TWL Adapter] \u26A0\uFE0F Missing or empty twLink in line ".concat(index + 1, ":"), {
                    reference: reference,
                    id: id,
                    partsCount: parts.length,
                    expectedColumns: 6,
                    hasTwLink: !!twLink,
                    twLinkValue: twLink,
                });
            }
            // Extract article path from TWLink (RC link) if available
            // rc://*/tw/dict/bible/kt/god -> bible/kt/god
            var articlePath = '';
            var twLinkValue = twLink === null || twLink === void 0 ? void 0 : twLink.trim();
            if (twLinkValue) {
                var articlePathMatch = twLinkValue.match(/rc:\/\/\*\/tw\/dict\/(.+)$/);
                articlePath = articlePathMatch ? articlePathMatch[1] : '';
            }
            else if (id && id.startsWith('rc://')) {
                // Fallback: if id is an RC link (older format)
                var articlePathMatch = id.match(/rc:\/\/\*\/tw\/dict\/(.+)$/);
                articlePath = articlePathMatch ? articlePathMatch[1] : '';
            }
            var link = {
                reference: reference,
                id: id || "twl-".concat(bookCode, "-").concat(index),
                tags: tags,
                origWords: origWords,
                occurrence: occurrence,
                twLink: twLinkValue || undefined, // Include twLink if present (trim whitespace)
                articlePath: articlePath,
            };
            // Log first few parsed links
            if (index < 3) {
                console.log("[TWL Adapter] Parsed link ".concat(index + 1, ":"), {
                    reference: link.reference,
                    id: link.id,
                    twLink: link.twLink,
                    articlePath: link.articlePath,
                });
            }
            return link;
        });
        return {
            bookCode: bookCode,
            bookName: bookName,
            links: links,
            linksByChapter: {},
            metadata: {
                bookCode: bookCode,
                bookName: bookName,
                processingDate: new Date().toISOString(),
                totalLinks: links.length,
                chaptersWithLinks: [],
                statistics: {
                    totalLinks: links.length,
                    linksPerChapter: {},
                    linksByCategory: {},
                },
            },
        };
    };
    return TranslationWordsLinksAdapter;
}(base_adapter_1.BaseResourceAdapter));
exports.TranslationWordsLinksAdapter = TranslationWordsLinksAdapter;
