"use strict";
/**
 * Language Selection Component
 * Allows users to select one or more languages
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
exports.LanguageSelector = LanguageSelector;
var react_1 = require("react");
var store_1 = require("@/lib/store");
var door43_api_1 = require("@bt-synergy/door43-api");
var lucide_react_1 = require("lucide-react");
var subjects_1 = require("@/lib/subjects");
function LanguageSelector() {
    var _this = this;
    var availableLanguages = (0, store_1.usePackageStore)(function (state) { return state.availableLanguages; });
    var selectedLanguages = (0, store_1.usePackageStore)(function (state) { return state.selectedLanguages; });
    var loadingLanguages = (0, store_1.usePackageStore)(function (state) { return state.loadingLanguages; });
    var setAvailableLanguages = (0, store_1.usePackageStore)(function (state) { return state.setAvailableLanguages; });
    var setLoadingLanguages = (0, store_1.usePackageStore)(function (state) { return state.setLoadingLanguages; });
    var toggleLanguage = (0, store_1.usePackageStore)(function (state) { return state.toggleLanguage; });
    (0, react_1.useEffect)(function () {
        loadLanguages();
    }, []);
    var loadLanguages = function () { return __awaiter(_this, void 0, void 0, function () {
        var client, languages, missingCode, missingName, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setLoadingLanguages(true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    console.log('🌐 Loading languages with filters:', subjects_1.API_FILTERS);
                    client = (0, door43_api_1.getDoor43ApiClient)();
                    return [4 /*yield*/, client.getLanguages(subjects_1.API_FILTERS)];
                case 2:
                    languages = _a.sent();
                    console.log('✅ Door43 API Response:', {
                        endpoint: '/api/v1/catalog/list/languages',
                        filters: subjects_1.API_FILTERS,
                        count: languages.length,
                        sample: languages.slice(0, 3),
                    });
                    // Show ALL languages from API, even if incomplete
                    // This helps identify API data issues
                    setAvailableLanguages(languages);
                    missingCode = languages.filter(function (l) { return !l.code; }).length;
                    missingName = languages.filter(function (l) { return !l.name; }).length;
                    if (missingCode > 0 || missingName > 0) {
                        console.warn('⚠️ API Data Quality Issues:', {
                            total: languages.length,
                            missingCode: missingCode,
                            missingName: missingName,
                            message: 'Some languages are missing required fields'
                        });
                    }
                    return [3 /*break*/, 5];
                case 3:
                    error_1 = _a.sent();
                    console.error('❌ Failed to load languages:', error_1);
                    throw error_1; // Re-throw to show error in UI
                case 4:
                    setLoadingLanguages(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    if (loadingLanguages) {
        return (<div className="flex items-center justify-center py-20">
        <lucide_react_1.Loader2 className="w-8 h-8 animate-spin text-primary-500"/>
        <span className="ml-3 text-gray-600">Loading languages from Door43 API...</span>
      </div>);
    }
    var validLanguages = availableLanguages.filter(function (l) { return l.code && l.name; });
    var invalidLanguages = availableLanguages.filter(function (l) { return !l.code || !l.name; });
    return (<div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Languages</h2>
        <p className="text-gray-600">
          Choose one or more languages for your package. You can mix resources from different languages.
        </p>
        
        {/* API Filters & Status */}
        <div className="mt-4 space-y-3">
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="text-sm mb-2">
              <span className="font-semibold text-purple-900">API Filters:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
              <code className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                stage=prod
              </code>
              <code className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                topic=tc-ready
              </code>
            </div>
            <div className="text-xs text-purple-700 mb-1">
              <span className="font-semibold">Subjects (7):</span>
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              {['Bible', 'Aligned Bible', 'Translation Words', 'Translation Academy',
            'TSV Translation Notes', 'TSV Translation Questions', 'TSV Translation Words Links'].map(function (subject) { return (<code key={subject} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                  {subject}
                </code>); })}
            </div>
            <div className="text-xs text-purple-600 mt-2">
              Only showing languages with published packages in these subjects
            </div>
          </div>
          
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">API Response:</span>
              <span>{availableLanguages.length} total languages</span>
              {validLanguages.length > 0 && (<span className="text-green-600">• {validLanguages.length} valid</span>)}
              {invalidLanguages.length > 0 && (<span className="text-orange-600">• {invalidLanguages.length} incomplete</span>)}
            </div>
          </div>
        </div>
      </div>

      {availableLanguages.length === 0 && (<div className="text-center py-12">
          <div className="text-red-600 font-semibold mb-2">❌ No languages returned from API</div>
          <div className="text-sm text-gray-600">
            Check console for error details. Endpoint: /api/v1/catalog/list/languages
          </div>
        </div>)}

      {validLanguages.length > 0 && (<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {validLanguages.map(function (language) {
                var isSelected = selectedLanguages.has(language.code);
                return (<button key={language.code} onClick={function () { return toggleLanguage(language.code); }} className={"relative p-4 rounded-lg border-2 transition-all text-left ".concat(isSelected
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-primary-300 bg-white')}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <lucide_react_1.Globe className="w-5 h-5 text-gray-400"/>
                    <div>
                      <div className="font-semibold text-gray-900">{language.name}</div>
                      <div className="text-sm text-gray-500">
                        {language.code}
                        {language.anglicized_name && language.anglicized_name !== language.name && (<span className="text-gray-400"> • {language.anglicized_name}</span>)}
                      </div>
                    </div>
                  </div>
                  
                  {isSelected && (<lucide_react_1.Check className="w-5 h-5 text-primary-600"/>)}
                </div>
                
                {language.direction === 'rtl' && (<div className="mt-2 text-xs text-gray-500">Right-to-left</div>)}
              </button>);
            })}
        </div>)}

      {invalidLanguages.length > 0 && (<div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="font-semibold text-orange-900 mb-2">
            ⚠️ {invalidLanguages.length} Incomplete Language Records
          </div>
          <div className="text-sm text-orange-700 mb-3">
            These languages are missing required fields (code or name) and cannot be used:
          </div>
          <div className="max-h-40 overflow-y-auto">
            <pre className="text-xs bg-white p-2 rounded">
              {JSON.stringify(invalidLanguages.slice(0, 5), null, 2)}
            </pre>
          </div>
          {invalidLanguages.length > 5 && (<div className="text-xs text-orange-600 mt-2">
              ... and {invalidLanguages.length - 5} more
            </div>)}
        </div>)}

      {selectedLanguages.size > 0 && (<div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-200">
          <div className="font-medium text-primary-900 mb-2">
            Selected Languages ({selectedLanguages.size}):
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedLanguages).map(function (code) {
                var lang = availableLanguages.find(function (l) { return l.code === code; });
                return (<span key={code} className="px-3 py-1 bg-primary-600 text-white rounded-full text-sm">
                  {(lang === null || lang === void 0 ? void 0 : lang.name) || code}
                </span>);
            })}
          </div>
        </div>)}
    </div>);
}
