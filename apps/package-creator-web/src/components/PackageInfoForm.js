"use strict";
/**
 * Package Information Form
 * Collects package metadata
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageInfoForm = PackageInfoForm;
var store_1 = require("@/lib/store");
function PackageInfoForm() {
    var _a, _b;
    var _c = (0, store_1.usePackageStore)(), manifest = _c.manifest, setManifestField = _c.setManifestField;
    return (<div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Package Information</h2>
        <p className="text-gray-600">
          Enter basic information about your package.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Package Name *
          </label>
          <input type="text" value={manifest.name || ''} onChange={function (e) { return setManifestField('name', e.target.value); }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="e.g., My Multilingual Study Package"/>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea value={manifest.description || ''} onChange={function (e) { return setManifestField('description', e.target.value); }} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Describe your package..."/>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Version
            </label>
            <input type="text" value={manifest.version || '1.0.0'} onChange={function (e) { return setManifestField('version', e.target.value); }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="1.0.0"/>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Author
            </label>
            <input type="text" value={((_a = manifest.metadata) === null || _a === void 0 ? void 0 : _a.author) || ''} onChange={function (e) {
            return setManifestField('metadata', __assign(__assign({}, manifest.metadata), { author: e.target.value }));
        }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Your name"/>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            License
          </label>
          <select value={((_b = manifest.metadata) === null || _b === void 0 ? void 0 : _b.license) || 'CC BY-SA 4.0'} onChange={function (e) {
            return setManifestField('metadata', __assign(__assign({}, manifest.metadata), { license: e.target.value }));
        }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            <option value="CC BY-SA 4.0">CC BY-SA 4.0</option>
            <option value="CC BY 4.0">CC BY 4.0</option>
            <option value="CC0">CC0 (Public Domain)</option>
            <option value="Custom">Custom</option>
          </select>
        </div>

        {/* Note: App-specific settings removed */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-900">
            <div className="font-semibold mb-1">App-Specific Settings</div>
            <div className="text-blue-700">
              Settings like offline caching, auto-updates, and update frequency are app-specific
              and should be configured in your app, not in the manifest.
            </div>
          </div>
        </div>
      </div>
    </div>);
}
