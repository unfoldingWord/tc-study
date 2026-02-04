"use strict";
/**
 * Organization Selection Component
 * Shows organizations that have resources in selected languages
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.OrganizationSelector = OrganizationSelector;
var react_1 = require("react");
var store_1 = require("@/lib/store");
var door43_api_1 = require("@bt-synergy/door43-api");
var lucide_react_1 = require("lucide-react");
var subjects_1 = require("@/lib/subjects");
function OrganizationSelector() {
    var _this = this;
    var selectedLanguages = (0, store_1.usePackageStore)(function (state) { return state.selectedLanguages; });
    var selectedOrganizations = (0, store_1.usePackageStore)(function (state) { return state.selectedOrganizations; });
    var setLoadingOrganizations = (0, store_1.usePackageStore)(function (state) { return state.setLoadingOrganizations; });
    var toggleOrganization = (0, store_1.usePackageStore)(function (state) { return state.toggleOrganization; });
    var _a = (0, react_1.useState)([]), organizations = _a[0], setOrganizations = _a[1];
    var _b = (0, react_1.useState)(false), loading = _b[0], setLoading = _b[1];
    (0, react_1.useEffect)(function () {
        if (selectedLanguages.size > 0) {
            loadOrganizations();
        }
    }, [selectedLanguages]);
    var loadOrganizations = function () { return __awaiter(_this, void 0, void 0, function () {
        var client, languages, orgs, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setLoading(true);
                    setLoadingOrganizations(true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    console.log('🏢 Loading organizations with filters:', subjects_1.API_FILTERS);
                    client = (0, door43_api_1.getDoor43ApiClient)();
                    languages = Array.from(selectedLanguages);
                    console.log('📡 Fetching organizations with filters:', __assign({ languages: languages }, subjects_1.API_FILTERS));
                    return [4 /*yield*/, client.getOrganizations({
                            languages: languages,
                            subjects: subjects_1.API_FILTERS.subjects,
                            stage: subjects_1.API_FILTERS.stage,
                            topic: subjects_1.API_FILTERS.topic
                        })];
                case 2:
                    orgs = _a.sent();
                    console.log("\u2705 Received ".concat(orgs.length, " organizations"));
                    setOrganizations(orgs);
                    if (orgs.length === 0) {
                        console.warn('⚠️ No organizations found for selected languages');
                    }
                    return [3 /*break*/, 5];
                case 3:
                    error_1 = _a.sent();
                    console.error('❌ Failed to load organizations:', error_1);
                    setOrganizations([]);
                    return [3 /*break*/, 5];
                case 4:
                    setLoading(false);
                    setLoadingOrganizations(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    if (loading) {
        return (<div className="flex items-center justify-center py-20">
        <lucide_react_1.Loader2 className="w-8 h-8 animate-spin text-primary-500"/>
        <span className="ml-3 text-gray-600">Loading organizations...</span>
      </div>);
    }
    return (<div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Organizations</h2>
        <p className="text-gray-600 mb-4">
          Choose one or more organizations to source resources from.
        </p>
        
        {/* Filter Status */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm">
            <span className="font-semibold text-blue-900">Filtered by:</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from(selectedLanguages).map(function (lang) { return (<code key={lang} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                  {lang}
                </code>); })}
            </div>
            <div className="text-xs text-blue-600 mt-2">
              Showing organizations with published packages in selected languages
            </div>
          </div>
        </div>
        
        {!loading && organizations.length > 0 && (<div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
            ✅ Found {organizations.length} organization{organizations.length !== 1 ? 's' : ''} with resources
          </div>)}
      </div>

      {organizations.length === 0 && !loading && (<div className="text-center py-12 text-gray-500">
          <div className="text-orange-600 font-semibold mb-2">
            ⚠️ No organizations found
          </div>
          <div className="text-sm">
            No organizations have published packages for the selected languages.
            <br />
            Try selecting different languages.
          </div>
        </div>)}

      {organizations.length > 0 && (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {organizations.map(function (org) {
                var isSelected = selectedOrganizations.has(org.username);
                return (<button key={org.id} onClick={function () { return toggleOrganization(org.username); }} className={"relative p-6 rounded-lg border-2 transition-all text-left ".concat(isSelected
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-primary-300 bg-white')}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {org.avatar_url ? (<img src={org.avatar_url} alt={org.username} className="w-10 h-10 rounded-full"/>) : (<lucide_react_1.Building2 className="w-10 h-10 text-gray-400"/>)}
                  <div>
                    <div className="font-semibold text-gray-900">
                      {org.full_name || org.username}
                    </div>
                    <div className="text-sm text-gray-500">@{org.username}</div>
                  </div>
                </div>
                
                {isSelected && (<lucide_react_1.Check className="w-5 h-5 text-primary-600 flex-shrink-0"/>)}
              </div>
              
              {org.description && (<p className="text-sm text-gray-600 line-clamp-2">
                  {org.description}
                </p>)}
              
              {org.website && (<div className="mt-3 text-xs text-primary-600">
                  {org.website}
                </div>)}
            </button>);
            })}
        </div>)}

      {selectedOrganizations.size > 0 && (<div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-200">
          <div className="font-medium text-primary-900 mb-2">
            Selected Organizations ({selectedOrganizations.size}):
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedOrganizations).map(function (username) {
                var org = organizations.find(function (o) { return o.username === username; });
                return (<span key={username} className="px-3 py-1 bg-primary-600 text-white rounded-full text-sm">
                  {(org === null || org === void 0 ? void 0 : org.full_name) || username}
                </span>);
            })}
          </div>
        </div>)}
    </div>);
}
