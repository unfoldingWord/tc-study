"use strict";
/**
 * Manifest Preview Component
 * Shows the final package manifest and allows downloading as JSON
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
exports.ManifestPreview = ManifestPreview;
var react_1 = require("react");
var lucide_react_1 = require("lucide-react");
var store_1 = require("@/lib/store");
function ManifestPreview(_a) {
    var _this = this;
    var _b = _a === void 0 ? {} : _a, onAddMoreResources = _b.onAddMoreResources, onBackToManage = _b.onBackToManage;
    var generateManifest = (0, store_1.usePackageStore)(function (state) { return state.generateManifest; });
    var _c = (0, react_1.useState)(false), copied = _c[0], setCopied = _c[1];
    var manifest = generateManifest();
    var manifestJson = JSON.stringify(manifest, null, 2);
    // Derive stats from resources (since we removed redundant stats fields)
    var organizations = Array.from(new Set(manifest.resources.map(function (r) { return r.owner; })));
    var languagesMap = new Map();
    manifest.resources.forEach(function (r) {
        if (!languagesMap.has(r.language.code)) {
            languagesMap.set(r.language.code, r.language);
        }
    });
    var languages = Array.from(languagesMap.values());
    var subjects = Array.from(new Set(manifest.resources.map(function (r) { return r.content.subject; })));
    var handleDownload = function () {
        var blob = new Blob([manifestJson], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = "".concat(manifest.id, ".json");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    var handleCopy = function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, navigator.clipboard.writeText(manifestJson)];
                case 1:
                    _a.sent();
                    setCopied(true);
                    setTimeout(function () { return setCopied(false); }, 2000);
                    return [2 /*return*/];
            }
        });
    }); };
    return (<div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Preview & Download</h2>
            <p className="text-gray-600">
              Review your package manifest and download the JSON file.
            </p>
          </div>
          <div className="flex gap-2">
            {onBackToManage && (<button onClick={onBackToManage} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <lucide_react_1.ArrowLeft className="w-4 h-4"/>
                Back to Manage
              </button>)}
            {onAddMoreResources && (<button onClick={onAddMoreResources} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                <lucide_react_1.Plus className="w-5 h-5"/>
                Add More Resources
              </button>)}
          </div>
        </div>
      </div>

      {/* Package Summary */}
      <div className="mb-6 p-6 bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg border border-primary-200">
        <h3 className="font-bold text-lg text-gray-900 mb-4">{manifest.name}</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Resources</div>
            <div className="font-semibold text-gray-900">{manifest.resources.length}</div>
          </div>
          <div>
            <div className="text-gray-500">Estimated Size</div>
            <div className="font-semibold text-gray-900">
              {(manifest.stats.estimatedSize / (1024 * 1024)).toFixed(1)} MB
            </div>
          </div>
          <div>
            <div className="text-gray-500">Format Version</div>
            <div className="font-semibold text-gray-900">{manifest.formatVersion}</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-primary-200">
          <div className="text-sm text-gray-600 mb-2">Languages ({languages.length}):</div>
          <div className="flex flex-wrap gap-2">
            {languages.map(function (lang) { return (<span key={lang.code} className="px-2 py-1 bg-white rounded text-xs">
                {lang.name} ({lang.code})
              </span>); })}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-sm text-gray-600 mb-2">Organizations ({organizations.length}):</div>
          <div className="flex flex-wrap gap-2">
            {organizations.map(function (org) { return (<span key={org} className="px-2 py-1 bg-white rounded text-xs">
                {org}
              </span>); })}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-sm text-gray-600 mb-2">Subjects ({subjects.length}):</div>
          <div className="flex flex-wrap gap-2">
            {subjects.map(function (subject) { return (<span key={subject} className="px-2 py-1 bg-white rounded text-xs">
                {subject}
              </span>); })}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button onClick={handleDownload} className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
          <lucide_react_1.Download className="w-5 h-5"/>
          Download JSON
        </button>

        <button onClick={handleCopy} className="flex items-center gap-2 px-6 py-3 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors font-medium">
          {copied ? (<>
              <lucide_react_1.Check className="w-5 h-5"/>
              Copied!
            </>) : (<>
              <lucide_react_1.Copy className="w-5 h-5"/>
              Copy to Clipboard
            </>)}
        </button>
      </div>

      {/* JSON Preview */}
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-gray-300">{manifest.id}.json</span>
            <span className="text-xs text-gray-400">
              {(new Blob([manifestJson]).size / 1024).toFixed(1)} KB
            </span>
          </div>
        </div>
        <pre className="p-4 overflow-x-auto">
          <code className="text-sm text-gray-100 font-mono">{manifestJson}</code>
        </pre>
      </div>
    </div>);
}
