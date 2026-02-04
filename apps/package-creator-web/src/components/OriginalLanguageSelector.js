"use strict";
/**
 * Original Language Selector Component
 * Allows users to select Greek and Hebrew resources for Aligned Bible texts
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
exports.OriginalLanguageSelector = OriginalLanguageSelector;
var react_1 = require("react");
var store_1 = require("@/lib/store");
var door43_api_1 = require("@bt-synergy/door43-api");
var lucide_react_1 = require("lucide-react");
var subjects_1 = require("@/lib/subjects");
function OriginalLanguageSelector() {
    var _this = this;
    var selectedResources = (0, store_1.usePackageStore)(function (state) { return state.selectedResources; });
    var toggleResource = (0, store_1.usePackageStore)(function (state) { return state.toggleResource; });
    var _a = (0, react_1.useState)([]), greekResources = _a[0], setGreekResources = _a[1];
    var _b = (0, react_1.useState)([]), hebrewResources = _b[0], setHebrewResources = _b[1];
    var _c = (0, react_1.useState)(false), loading = _c[0], setLoading = _c[1];
    var _d = (0, react_1.useState)(new Set()), recommendedGreekIds = _d[0], setRecommendedGreekIds = _d[1];
    var _e = (0, react_1.useState)(new Set()), recommendedHebrewIds = _e[0], setRecommendedHebrewIds = _e[1];
    var _f = (0, react_1.useState)(false), autoSelectionDone = _f[0], setAutoSelectionDone = _f[1];
    (0, react_1.useEffect)(function () {
        loadOriginalLanguageResources();
    }, []);
    var loadOriginalLanguageResources = function () { return __awaiter(_this, void 0, void 0, function () {
        var client, alignedBibleResources_1, recommendedGreek_1, recommendedHebrew_1, greekRes, hebrewRes, allResources, currentlySelected_1, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setLoading(true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, 5, 6]);
                    client = (0, door43_api_1.getDoor43ApiClient)();
                    alignedBibleResources_1 = Array.from(selectedResources.values()).filter(function (r) { return r.subject === 'Aligned Bible'; });
                    recommendedGreek_1 = new Set();
                    recommendedHebrew_1 = new Set();
                    if (alignedBibleResources_1.length > 0) {
                        console.log('🔍 Checking relations for Aligned Bible resources:', alignedBibleResources_1.map(function (r) { return r.id; }));
                        // Extract relations from catalog data (already fetched)
                        alignedBibleResources_1.forEach(function (resource) {
                            if (resource.relations && resource.relations.length > 0) {
                                console.log("   Relations for ".concat(resource.id, ":"), resource.relations);
                                // Check each relation
                                resource.relations.forEach(function (rel) {
                                    var lang = rel.lang;
                                    var identifier = rel.identifier;
                                    if (lang === 'el-x-koine' || identifier === 'ugnt') {
                                        recommendedGreek_1.add(identifier);
                                    }
                                    else if (lang === 'hbo' || identifier === 'uhb') {
                                        recommendedHebrew_1.add(identifier);
                                    }
                                });
                            }
                            else {
                                console.log("   No relations found for ".concat(resource.id));
                            }
                        });
                        console.log('   Recommended Greek:', Array.from(recommendedGreek_1));
                        console.log('   Recommended Hebrew:', Array.from(recommendedHebrew_1));
                    }
                    // Default to UGNT and UHB if no relations found
                    if (recommendedGreek_1.size === 0)
                        recommendedGreek_1.add('ugnt');
                    if (recommendedHebrew_1.size === 0)
                        recommendedHebrew_1.add('uhb');
                    setRecommendedGreekIds(recommendedGreek_1);
                    setRecommendedHebrewIds(recommendedHebrew_1);
                    // Load Greek resources (Koine Greek)
                    console.log('📜 Loading Greek resources...');
                    return [4 /*yield*/, client.getResourcesByOrgAndLanguage('unfoldingWord', 'el-x-koine', {
                            stage: subjects_1.API_FILTERS.stage,
                            topic: subjects_1.API_FILTERS.topic,
                        })];
                case 2:
                    greekRes = _a.sent();
                    console.log('   Found Greek resources:', greekRes.map(function (r) { return "".concat(r.id, " (").concat(r.subject, ")"); }));
                    setGreekResources(greekRes);
                    // Load Hebrew resources
                    console.log('📜 Loading Hebrew resources...');
                    return [4 /*yield*/, client.getResourcesByOrgAndLanguage('unfoldingWord', 'hbo', {
                            stage: subjects_1.API_FILTERS.stage,
                            topic: subjects_1.API_FILTERS.topic,
                        })];
                case 3:
                    hebrewRes = _a.sent();
                    console.log('   Found Hebrew resources:', hebrewRes.map(function (r) { return "".concat(r.id, " (").concat(r.subject, ")"); }));
                    setHebrewResources(hebrewRes);
                    // Auto-select recommended resources (only if not already done)
                    if (!autoSelectionDone) {
                        console.log('\n🔄 Starting auto-selection...');
                        console.log('   Recommended Greek IDs:', Array.from(recommendedGreek_1));
                        console.log('   Recommended Hebrew IDs:', Array.from(recommendedHebrew_1));
                        allResources = greekRes.concat(hebrewRes);
                        console.log('   All loaded resources:', allResources.map(function (r) { return "".concat(r.id, " (").concat(r.language, ")"); }));
                        currentlySelected_1 = store_1.usePackageStore.getState().selectedResources;
                        allResources.forEach(function (resource) {
                            var key = "".concat(resource.owner, "_").concat(resource.language, "_").concat(resource.id);
                            var isRecommended = recommendedGreek_1.has(resource.id) || recommendedHebrew_1.has(resource.id);
                            var alreadySelected = currentlySelected_1.has(key);
                            console.log("   Checking ".concat(resource.id, ":"), {
                                key: key,
                                isRecommended: isRecommended,
                                alreadySelected: alreadySelected,
                                inGreek: recommendedGreek_1.has(resource.id),
                                inHebrew: recommendedHebrew_1.has(resource.id)
                            });
                            if (isRecommended && !alreadySelected) {
                                console.log("   \u2705 Auto-selecting: ".concat(resource.id));
                                toggleResource(resource);
                            }
                        });
                        setAutoSelectionDone(true);
                        console.log("\u2705 Loaded ".concat(greekRes.length, " Greek and ").concat(hebrewRes.length, " Hebrew resources"));
                    }
                    else {
                        console.log('⏭️ Skipping auto-selection (already done)');
                    }
                    return [3 /*break*/, 6];
                case 4:
                    error_1 = _a.sent();
                    console.error('❌ Failed to load original language resources:', error_1);
                    return [3 /*break*/, 6];
                case 5:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    // Format relation display (lang/id?v=version -> LANG / ID v.VERSION)
    var formatRelationDisplay = function (rel) {
        var parts = [rel.identifier.toUpperCase()];
        if (rel.version) {
            parts.push("v".concat(rel.version));
        }
        return parts.join(' ');
    };
    if (loading) {
        return (<div className="flex items-center justify-center py-20">
        <lucide_react_1.Loader2 className="w-8 h-8 animate-spin text-primary-500"/>
        <span className="ml-3 text-gray-600">Loading original language resources...</span>
      </div>);
    }
    var selectedGreek = greekResources.filter(function (r) {
        return selectedResources.has("".concat(r.owner, "_").concat(r.language, "_").concat(r.id));
    });
    var selectedHebrew = hebrewResources.filter(function (r) {
        return selectedResources.has("".concat(r.owner, "_").concat(r.language, "_").concat(r.id));
    });
    // Get all Aligned Bible resources that were selected
    var alignedBibleResources = Array.from(selectedResources.values()).filter(function (r) { return r.subject === 'Aligned Bible'; });
    return (<div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Original Languages</h2>
        <p className="text-gray-600 mb-4">
          Choose Greek and Hebrew source texts for your Aligned Bible resources.
        </p>
        
        {/* Show Aligned Bible Resources and their relations */}
        {alignedBibleResources.length > 0 && (<div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-start gap-3">
              <lucide_react_1.Book className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0"/>
              <div className="flex-1">
                <div className="font-semibold text-purple-900 mb-2">
                  Your Aligned Bible Resources
                </div>
                <div className="space-y-2">
                  {alignedBibleResources.map(function (resource) {
                var hasRelations = resource.relations && resource.relations.length > 0;
                return (<div key={"".concat(resource.owner, "_").concat(resource.language, "_").concat(resource.id)} className="text-sm">
                        <div className="font-medium text-purple-900">
                          {resource.name} ({resource.id.toUpperCase()})
                        </div>
                        {hasRelations ? (<div className="text-purple-700 ml-4 mt-1">
                            → Aligned to: {resource.relations
                            .filter(function (rel) { return rel.lang === 'el-x-koine' || rel.lang === 'hbo'; })
                            .map(function (rel) { return formatRelationDisplay(rel); })
                            .join(', ')}
                          </div>) : (<div className="text-purple-600 ml-4 mt-1 italic">
                            → No alignment information available
                          </div>)}
                      </div>);
            })}
                </div>
              </div>
            </div>
          </div>)}
        
        {/* Info Banner */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <lucide_react_1.Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0"/>
          <div className="text-sm text-blue-900">
            <div className="font-semibold mb-1">About Original Languages</div>
            <div className="text-blue-700">
              Aligned Bible resources are word-aligned to original Greek and Hebrew texts. 
              We've auto-selected the recommended texts based on your Aligned Bible selections, 
              but you can choose different ones if needed.
            </div>
          </div>
        </div>
      </div>

      {/* Greek Resources */}
      {greekResources.length > 0 && (<div className="mb-8">
          <h3 className="font-bold text-lg text-gray-800 mb-3 flex items-center gap-2">
            <lucide_react_1.Book className="w-5 h-5"/>
            Greek New Testament
            <span className="text-sm font-normal text-gray-500">
              ({selectedGreek.length} of {greekResources.length} selected)
            </span>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {greekResources.map(function (resource) {
                var key = "".concat(resource.owner, "_").concat(resource.language, "_").concat(resource.id);
                var isSelected = selectedResources.has(key);
                var isRecommended = recommendedGreekIds.has(resource.id);
                return (<button key={key} onClick={function () { return toggleResource(resource); }} className={"p-4 rounded-lg border-2 transition-all text-left relative ".concat(isSelected
                        ? 'border-primary-500 bg-primary-50 shadow-sm'
                        : 'border-gray-200 hover:border-primary-300 bg-white hover:shadow-sm')}>
                  {isSelected && (<div className="absolute top-2 right-2">
                      <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                        <lucide_react_1.Check className="w-4 h-4 text-white"/>
                      </div>
                    </div>)}
                  
                  <div className="pr-8">
                    <div className="font-semibold text-gray-900 mb-1">
                      {resource.name || resource.title}
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                        {resource.id.toUpperCase()}
                      </span>
                      {isRecommended && (<span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-medium">
                          Recommended
                        </span>)}
                    </div>
                    
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div>{resource.owner}</div>
                      <div>{resource.subject}</div>
                      <div>Version {resource.version}</div>
                    </div>
                  </div>
                </button>);
            })}
          </div>
        </div>)}

      {/* Hebrew Resources */}
      {hebrewResources.length > 0 && (<div className="mb-6">
          <h3 className="font-bold text-lg text-gray-800 mb-3 flex items-center gap-2">
            <lucide_react_1.Book className="w-5 h-5"/>
            Hebrew Old Testament
            <span className="text-sm font-normal text-gray-500">
              ({selectedHebrew.length} of {hebrewResources.length} selected)
            </span>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {hebrewResources.map(function (resource) {
                var key = "".concat(resource.owner, "_").concat(resource.language, "_").concat(resource.id);
                var isSelected = selectedResources.has(key);
                var isRecommended = recommendedHebrewIds.has(resource.id);
                return (<button key={key} onClick={function () { return toggleResource(resource); }} className={"p-4 rounded-lg border-2 transition-all text-left relative ".concat(isSelected
                        ? 'border-primary-500 bg-primary-50 shadow-sm'
                        : 'border-gray-200 hover:border-primary-300 bg-white hover:shadow-sm')}>
                  {isSelected && (<div className="absolute top-2 right-2">
                      <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                        <lucide_react_1.Check className="w-4 h-4 text-white"/>
                      </div>
                    </div>)}
                  
                  <div className="pr-8">
                    <div className="font-semibold text-gray-900 mb-1">
                      {resource.name || resource.title}
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                        {resource.id.toUpperCase()}
                      </span>
                      {isRecommended && (<span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-medium">
                          Recommended
                        </span>)}
                    </div>
                    
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div>{resource.owner}</div>
                      <div>{resource.subject}</div>
                      <div>Version {resource.version}</div>
                    </div>
                  </div>
                </button>);
            })}
          </div>
        </div>)}

      {/* Summary */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="font-medium text-gray-900 mb-2">Selection Summary:</div>
        <div className="space-y-1 text-sm">
          {selectedGreek.length > 0 ? (<div className="text-green-700">
              ✓ Greek: {selectedGreek.map(function (r) { return r.id.toUpperCase(); }).join(', ')}
            </div>) : (<div className="text-gray-500">○ No Greek resource selected</div>)}
          
          {selectedHebrew.length > 0 ? (<div className="text-green-700">
              ✓ Hebrew: {selectedHebrew.map(function (r) { return r.id.toUpperCase(); }).join(', ')}
            </div>) : (<div className="text-gray-500">○ No Hebrew resource selected</div>)}
        </div>
        
        {(selectedGreek.length === 0 && selectedHebrew.length === 0) && (<div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
            ⚠️ No original language resources selected. Aligned Bible features may be limited.
          </div>)}
      </div>
    </div>);
}
