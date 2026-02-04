"use strict";
/**
 * Zustand store for package creation state
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
exports.usePackageStore = void 0;
var zustand_1 = require("zustand");
var package_builder_1 = require("@bt-synergy/package-builder");
var DEFAULT_MANIFEST = {
    formatVersion: '2.0.0',
    name: 'Untitled Package',
    version: '1.0.0',
    config: {
        defaultServer: 'https://git.door43.org',
    },
    status: 'draft',
};
exports.usePackageStore = (0, zustand_1.create)(function (set, get) { return ({
    manifest: DEFAULT_MANIFEST,
    selectedLanguages: new Set(),
    selectedLanguagesInfo: new Map(),
    selectedOrganizations: new Set(),
    selectedResources: new Map(),
    availableLanguages: [],
    availableOrganizations: [],
    availableResources: [],
    loadingLanguages: false,
    loadingOrganizations: false,
    loadingResources: false,
    setManifestField: function (field, value) {
        return set(function (state) {
            var _a;
            return ({
                manifest: __assign(__assign({}, state.manifest), (_a = {}, _a[field] = value, _a)),
            });
        });
    },
    toggleLanguage: function (languageCode) {
        return set(function (state) {
            var newSet = new Set(state.selectedLanguages);
            var newInfoMap = new Map(state.selectedLanguagesInfo);
            if (newSet.has(languageCode)) {
                newSet.delete(languageCode);
                newInfoMap.delete(languageCode);
            }
            else {
                newSet.add(languageCode);
                // Cache the full language info
                var langInfo = state.availableLanguages.find(function (l) { return l.code === languageCode; });
                if (langInfo) {
                    newInfoMap.set(languageCode, langInfo);
                }
            }
            return {
                selectedLanguages: newSet,
                selectedLanguagesInfo: newInfoMap
            };
        });
    },
    toggleOrganization: function (orgId) {
        return set(function (state) {
            var newSet = new Set(state.selectedOrganizations);
            if (newSet.has(orgId)) {
                newSet.delete(orgId);
            }
            else {
                newSet.add(orgId);
            }
            return { selectedOrganizations: newSet };
        });
    },
    toggleResource: function (resource) {
        return set(function (state) {
            var key = "".concat(resource.owner, "_").concat(resource.language, "_").concat(resource.id);
            var newMap = new Map(state.selectedResources);
            if (newMap.has(key)) {
                console.log('Store: Removing resource:', key);
                newMap.delete(key);
            }
            else {
                console.log('Store: Adding resource:', key, resource.name);
                newMap.set(key, resource);
            }
            console.log('Store: Total resources now:', newMap.size);
            return { selectedResources: newMap };
        });
    },
    clearSelections: function () {
        return set({
            selectedLanguages: new Set(),
            selectedLanguagesInfo: new Map(),
            selectedOrganizations: new Set(),
            selectedResources: new Map(),
        });
    },
    setAvailableLanguages: function (languages) {
        console.log('Store: setAvailableLanguages called with', languages.length, 'languages');
        set({ availableLanguages: languages });
    },
    setAvailableOrganizations: function (orgs) { return set({ availableOrganizations: orgs }); },
    setAvailableResources: function (resources) { return set({ availableResources: resources }); },
    setLoadingLanguages: function (loading) { return set({ loadingLanguages: loading }); },
    setLoadingOrganizations: function (loading) { return set({ loadingOrganizations: loading }); },
    setLoadingResources: function (loading) { return set({ loadingResources: loading }); },
    getLanguageDisplayName: function (languageCode) {
        var state = get();
        var langInfo = state.selectedLanguagesInfo.get(languageCode);
        if (langInfo) {
            // Return native name if available, otherwise English name, otherwise code
            return langInfo.name || langInfo.code;
        }
        return languageCode;
    },
    generateManifest: function () {
        var state = get();
        var resources = Array.from(state.selectedResources.values());
        console.log('📦 Generating manifest from', resources.length, 'resources');
        console.log('   Resource IDs:', resources.map(function (r) { return "".concat(r.owner, "_").concat(r.language, "_").concat(r.id); }));
        // Convert selectedLanguagesInfo Map to the format expected by generateManifest
        var languageInfoMap = new Map(Array.from(state.selectedLanguagesInfo.entries()).map(function (_a) {
            var code = _a[0], lang = _a[1];
            return [
                code,
                {
                    code: lang.code,
                    name: lang.name,
                    direction: lang.direction,
                }
            ];
        }));
        // Use the shared package-builder logic
        var manifest = (0, package_builder_1.generateManifest)(resources, {
            packageName: state.manifest.name,
            packageDescription: state.manifest.description,
            packageVersion: state.manifest.version || '1.0.0',
            config: state.manifest.config,
            createdBy: state.manifest.createdBy,
            languageInfo: languageInfoMap,
        });
        console.log('✅ Generated manifest with', manifest.resources.length, 'resources');
        // Merge with any additional manifest fields from state
        return __assign(__assign({}, manifest), { id: state.manifest.id || manifest.id });
    },
}); });
// All utility functions are now imported from @bt-synergy/package-builder
