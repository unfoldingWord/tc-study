"use strict";
/**
 * Package Resource Manager Component
 * Shows all resources in the package and allows removal
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageResourceManager = PackageResourceManager;
var store_1 = require("@/lib/store");
var lucide_react_1 = require("lucide-react");
function PackageResourceManager() {
    var selectedResources = (0, store_1.usePackageStore)(function (state) { return state.selectedResources; });
    var toggleResource = (0, store_1.usePackageStore)(function (state) { return state.toggleResource; });
    var getLanguageDisplayName = (0, store_1.usePackageStore)(function (state) { return state.getLanguageDisplayName; });
    var resources = Array.from(selectedResources.values());
    // Group resources by type
    var groupedResources = resources.reduce(function (acc, resource) {
        var subject = resource.subject || 'Other';
        if (!acc[subject]) {
            acc[subject] = [];
        }
        acc[subject].push(resource);
        return acc;
    }, {});
    var getResourceIcon = function (resourceId) {
        if (['ult', 'ust', 'glt', 'gst', 'ugnt', 'uhb'].includes(resourceId)) {
            return lucide_react_1.Book;
        }
        if (['tn', 'tsv-tn'].includes(resourceId)) {
            return lucide_react_1.FileText;
        }
        if (['tq', 'tsv-tq'].includes(resourceId)) {
            return lucide_react_1.HelpCircle;
        }
        if (['tw', 'twl', 'tsv-tw'].includes(resourceId)) {
            return lucide_react_1.BookOpen;
        }
        return lucide_react_1.FileText;
    };
    if (resources.length === 0) {
        return (<div className="p-8 text-center">
        <div className="text-gray-400 mb-2">No resources selected yet</div>
        <div className="text-sm text-gray-500">
          Use the wizard above to select languages, organizations, and resources.
        </div>
      </div>);
    }
    // Get unique languages and organizations
    var languages = new Set(resources.map(function (r) { return r.language; }));
    var organizations = new Set(resources.map(function (r) { return r.owner; }));
    return (<div>
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-3">Package Contents</h3>
        
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-900">{resources.length}</div>
            <div className="text-sm text-blue-600">Resources</div>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-2xl font-bold text-purple-900">{languages.size}</div>
            <div className="text-sm text-purple-600">Languages</div>
          </div>
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-900">{organizations.size}</div>
            <div className="text-sm text-green-600">Organizations</div>
          </div>
        </div>
      </div>

      {/* Resources by subject */}
      <div className="space-y-6">
        {Object.entries(groupedResources)
            .sort(function (_a, _b) {
            var a = _a[0];
            var b = _b[0];
            // Sort: Aligned Bible first, then alphabetically
            if (a === 'Aligned Bible')
                return -1;
            if (b === 'Aligned Bible')
                return 1;
            return a.localeCompare(b);
        })
            .map(function (_a) {
            var subject = _a[0], subjectResources = _a[1];
            return (<div key={subject}>
              <h4 className="text-lg font-semibold text-gray-800 mb-3">{subject}</h4>
              <div className="space-y-2">
                {subjectResources
                    .sort(function (a, b) {
                    // Sort by language first, then by name
                    if (a.language !== b.language) {
                        return a.language.localeCompare(b.language);
                    }
                    return a.name.localeCompare(b.name);
                })
                    .map(function (resource) {
                    var key = "".concat(resource.owner, "_").concat(resource.language, "_").concat(resource.id);
                    var Icon = getResourceIcon(resource.id);
                    return (<div key={key} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                        <div className="flex items-center gap-3 flex-1">
                          <Icon className="w-5 h-5 text-gray-400 flex-shrink-0"/>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 truncate">
                              {resource.name}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                              <span className="flex items-center gap-1">
                                <lucide_react_1.Languages className="w-3 h-3"/>
                                {getLanguageDisplayName(resource.language)}
                              </span>
                              <span className="text-gray-300">•</span>
                              <span className="flex items-center gap-1">
                                <lucide_react_1.Building2 className="w-3 h-3"/>
                                {resource.owner}
                              </span>
                              <span className="text-gray-300">•</span>
                              <span className="uppercase">{resource.id}</span>
                            </div>
                          </div>
                        </div>
                        
                        <button onClick={function () { return toggleResource(resource); }} className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 ml-3" title="Remove resource">
                          <lucide_react_1.Trash2 className="w-4 h-4"/>
                          <span className="hidden sm:inline">Remove</span>
                        </button>
                      </div>);
                })}
              </div>
            </div>);
        })}
      </div>

      {/* Summary footer */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-sm text-gray-600">
          <div className="font-semibold text-gray-900 mb-2">Languages Included:</div>
          <div className="flex flex-wrap gap-2">
            {Array.from(languages).map(function (lang) { return (<span key={lang} className="px-2 py-1 bg-white border border-gray-300 rounded text-xs">
                {getLanguageDisplayName(lang)}
              </span>); })}
          </div>
          
          <div className="font-semibold text-gray-900 mt-3 mb-2">Organizations Included:</div>
          <div className="flex flex-wrap gap-2">
            {Array.from(organizations).map(function (org) { return (<span key={org} className="px-2 py-1 bg-white border border-gray-300 rounded text-xs">
                {org}
              </span>); })}
          </div>
        </div>
      </div>
    </div>);
}
