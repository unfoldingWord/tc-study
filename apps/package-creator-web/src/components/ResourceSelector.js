"use strict";
/**
 * Resource Selection Component
 * Shows resources from selected languages and organizations
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
exports.ResourceSelector = ResourceSelector;
var react_1 = require("react");
var store_1 = require("@/lib/store");
var door43_api_1 = require("@bt-synergy/door43-api");
var lucide_react_1 = require("lucide-react");
var subjects_1 = require("@/lib/subjects");
function ResourceSelector() {
    var _this = this;
    var selectedLanguages = (0, store_1.usePackageStore)(function (state) { return state.selectedLanguages; });
    var selectedOrganizations = (0, store_1.usePackageStore)(function (state) { return state.selectedOrganizations; });
    var selectedResources = (0, store_1.usePackageStore)(function (state) { return state.selectedResources; });
    var toggleResource = (0, store_1.usePackageStore)(function (state) { return state.toggleResource; });
    var getLanguageDisplayName = (0, store_1.usePackageStore)(function (state) { return state.getLanguageDisplayName; });
    var _a = (0, react_1.useState)([]), resources = _a[0], setResources = _a[1];
    var _b = (0, react_1.useState)(false), loading = _b[0], setLoading = _b[1];
    var _c = (0, react_1.useState)('language'), groupBy = _c[0], setGroupBy = _c[1];
    (0, react_1.useEffect)(function () {
        if (selectedLanguages.size > 0 && selectedOrganizations.size > 0) {
            loadResources();
        }
    }, [selectedLanguages, selectedOrganizations]);
    var loadResources = function () { return __awaiter(_this, void 0, void 0, function () {
        var client, allResources, _i, _a, lang, _b, _c, org, resources_1, error_1, error_2;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    setLoading(true);
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 10, 11, 12]);
                    client = (0, door43_api_1.getDoor43ApiClient)();
                    allResources = [];
                    console.log('📚 Loading resources with filters:', subjects_1.API_FILTERS);
                    _i = 0, _a = Array.from(selectedLanguages);
                    _d.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 9];
                    lang = _a[_i];
                    _b = 0, _c = Array.from(selectedOrganizations);
                    _d.label = 3;
                case 3:
                    if (!(_b < _c.length)) return [3 /*break*/, 8];
                    org = _c[_b];
                    _d.label = 4;
                case 4:
                    _d.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, client.getResourcesByOrgAndLanguage(org, lang, {
                            subjects: subjects_1.API_FILTERS.subjects,
                            stage: subjects_1.API_FILTERS.stage,
                            topic: subjects_1.API_FILTERS.topic,
                        })];
                case 5:
                    resources_1 = _d.sent();
                    allResources.push.apply(allResources, resources_1);
                    return [3 /*break*/, 7];
                case 6:
                    error_1 = _d.sent();
                    console.error("Failed to load resources for ".concat(org, "/").concat(lang, ":"), error_1);
                    return [3 /*break*/, 7];
                case 7:
                    _b++;
                    return [3 /*break*/, 3];
                case 8:
                    _i++;
                    return [3 /*break*/, 2];
                case 9:
                    setResources(allResources);
                    return [3 /*break*/, 12];
                case 10:
                    error_2 = _d.sent();
                    console.error('Failed to load resources:', error_2);
                    return [3 /*break*/, 12];
                case 11:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 12: return [2 /*return*/];
            }
        });
    }); };
    var getResourceIcon = function (id) {
        if (['ult', 'ust', 'glt', 'gst', 'ugnt', 'uhb'].includes(id))
            return lucide_react_1.Book;
        if (['tn'].includes(id))
            return lucide_react_1.FileText;
        if (['tq'].includes(id))
            return lucide_react_1.HelpCircle;
        if (['tw', 'ta'].includes(id))
            return lucide_react_1.BookOpen;
        return lucide_react_1.FileText;
    };
    var groupedResources = function () {
        if (groupBy === 'language') {
            return resources.reduce(function (acc, resource) {
                // Group by language code (we'll display the name later)
                var key = resource.language;
                if (!acc[key])
                    acc[key] = [];
                acc[key].push(resource);
                return acc;
            }, {});
        }
        if (groupBy === 'organization') {
            return resources.reduce(function (acc, resource) {
                var key = resource.owner;
                if (!acc[key])
                    acc[key] = [];
                acc[key].push(resource);
                return acc;
            }, {});
        }
        // Group by subject
        return resources.reduce(function (acc, resource) {
            var key = resource.subject || 'Other';
            if (!acc[key])
                acc[key] = [];
            acc[key].push(resource);
            return acc;
        }, {});
    };
    // Helper function to get display name for group headers
    var getGroupDisplayName = function (group) {
        if (groupBy === 'language') {
            // Get the display name from cached language info
            var displayName = getLanguageDisplayName(group);
            if (displayName !== group) {
                // We have a proper name, show it with code in parentheses
                return "".concat(displayName, " (").concat(group, ")");
            }
            return group;
        }
        return group;
    };
    if (loading) {
        return (<div className="flex items-center justify-center py-20">
        <lucide_react_1.Loader2 className="w-8 h-8 animate-spin text-primary-500"/>
        <span className="ml-3 text-gray-600">Loading resources...</span>
      </div>);
    }
    var grouped = groupedResources();
    return (<div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Resources</h2>
        <p className="text-gray-600 mb-4">
          Choose the resources to include in your package.
        </p>
        
        {/* Aligned Bible notice */}
        {Array.from(selectedResources.values()).some(function (r) { return r.subject === 'Aligned Bible'; }) && (<div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <lucide_react_1.Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0"/>
              <div className="text-sm">
                <div className="font-semibold text-blue-900 mb-1">
                  Original Languages Required
                </div>
                <div className="text-blue-700">
                  You've selected Aligned Bible resources. In the next step, you'll choose which Greek and Hebrew texts to include.
                </div>
              </div>
            </div>
          </div>)}

        <div className="flex gap-2">
          <label className="text-sm text-gray-600">Group by:</label>
          <select value={groupBy} onChange={function (e) { return setGroupBy(e.target.value); }} className="text-sm border border-gray-300 rounded px-2 py-1">
            <option value="language">Language</option>
            <option value="organization">Organization</option>
            <option value="type">Subject</option>
          </select>
        </div>
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(function (_a) {
            var group = _a[0], groupResources = _a[1];
            return (<div key={group} className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-bold text-lg text-gray-800 mb-3">{getGroupDisplayName(group)}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {groupResources.map(function (resource) {
                    var key = "".concat(resource.owner, "_").concat(resource.language, "_").concat(resource.id);
                    var isSelected = selectedResources.has(key);
                    var Icon = getResourceIcon(resource.id);
                    return (<button key={key} onClick={function () { return toggleResource(resource); }} className={"relative p-4 rounded-lg border-2 transition-all text-left ".concat(isSelected
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-primary-300 bg-white')}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Icon className="w-5 h-5 text-gray-400 mt-0.5"/>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">{resource.name}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            {resource.id.toUpperCase()} • {resource.owner}
                          </div>
                          {resource.subject && (<div className="text-xs text-gray-400 mt-1">
                              {resource.subject}
                            </div>)}
                        </div>
                      </div>
                      
                      {isSelected && (<lucide_react_1.Check className="w-5 h-5 text-primary-600 flex-shrink-0"/>)}
                    </div>
                  </button>);
                })}
            </div>
          </div>);
        })}
      </div>

      {resources.length === 0 && !loading && (<div className="text-center py-12 text-gray-500">
          No resources found for selected languages and organizations.
        </div>)}
    </div>);
}
