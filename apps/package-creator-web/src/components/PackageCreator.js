"use strict";
/**
 * Main Package Creator Component
 * Orchestrates the package creation workflow
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageCreator = PackageCreator;
var react_1 = require("react");
var store_1 = require("@/lib/store");
var LanguageSelector_1 = require("./LanguageSelector");
var OrganizationSelector_1 = require("./OrganizationSelector");
var ResourceSelector_1 = require("./ResourceSelector");
var OriginalLanguageSelector_1 = require("./OriginalLanguageSelector");
var PackageInfoForm_1 = require("./PackageInfoForm");
var ManifestPreview_1 = require("./ManifestPreview");
var PackageResourceManager_1 = require("./PackageResourceManager");
var lucide_react_1 = require("lucide-react");
function PackageCreator() {
    var _a = (0, react_1.useState)('languages'), currentStep = _a[0], setCurrentStep = _a[1];
    var _b = (0, react_1.useState)(false), isAddingMore = _b[0], setIsAddingMore = _b[1];
    // Subscribe to store state for reactivity
    var selectedLanguages = (0, store_1.usePackageStore)(function (state) { return state.selectedLanguages; });
    var selectedOrganizations = (0, store_1.usePackageStore)(function (state) { return state.selectedOrganizations; });
    var selectedResources = (0, store_1.usePackageStore)(function (state) { return state.selectedResources; });
    var manifest = (0, store_1.usePackageStore)(function (state) { return state.manifest; });
    // Check if user has selected any Aligned Bible resources
    var hasAlignedBibleResources = Array.from(selectedResources.values()).some(function (r) { return r.subject === 'Aligned Bible'; });
    var allSteps = [
        { id: 'languages', label: 'Select Languages', icon: lucide_react_1.Package },
        { id: 'organizations', label: 'Select Organizations', icon: lucide_react_1.Settings },
        { id: 'resources', label: 'Select Resources', icon: lucide_react_1.Package },
        { id: 'original-languages', label: 'Original Languages', icon: lucide_react_1.Book, conditional: true },
        { id: 'info', label: 'Package Info', icon: lucide_react_1.Settings },
        { id: 'manage', label: 'Manage Resources', icon: lucide_react_1.List },
        { id: 'preview', label: 'Preview & Download', icon: lucide_react_1.Download },
    ];
    // Filter steps based on conditions
    var steps = allSteps.filter(function (step) {
        if (step.id === 'original-languages') {
            return hasAlignedBibleResources;
        }
        return true;
    });
    var currentStepIndex = steps.findIndex(function (s) { return s.id === currentStep; });
    var canProceed = function () {
        if (currentStep === 'languages')
            return selectedLanguages.size > 0;
        if (currentStep === 'organizations')
            return selectedOrganizations.size > 0;
        if (currentStep === 'resources')
            return selectedResources.size > 0;
        if (currentStep === 'original-languages')
            return true; // Optional step
        if (currentStep === 'info')
            return manifest.name && manifest.name !== 'Untitled Package';
        if (currentStep === 'manage')
            return selectedResources.size > 0;
        return true;
    };
    var handleAddMoreResources = function () {
        setIsAddingMore(true);
        setCurrentStep('languages');
    };
    var handleBackToManage = function () {
        setIsAddingMore(false);
        setCurrentStep('manage');
    };
    var handleNext = function () {
        var nextIndex = currentStepIndex + 1;
        // Skip original-languages step if no Aligned Bible resources and moving forward
        if (nextIndex < steps.length) {
            var nextStep = steps[nextIndex];
            // If moving from resources to next, check if we should skip original-languages
            if (currentStep === 'resources' && !hasAlignedBibleResources) {
                // Find the actual next step after original-languages
                var targetStep = allSteps.find(function (s, i) {
                    var currentIdx = allSteps.findIndex(function (as) { return as.id === currentStep; });
                    return i > currentIdx && s.id !== 'original-languages';
                });
                if (targetStep) {
                    setCurrentStep(targetStep.id);
                    return;
                }
            }
            setCurrentStep(nextStep.id);
        }
    };
    var handleBack = function () {
        var prevIndex = currentStepIndex - 1;
        if (prevIndex >= 0) {
            setCurrentStep(steps[prevIndex].id);
        }
    };
    return (<div className="bg-white rounded-lg shadow-lg">
      {/* Progress Steps */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          {steps.map(function (step, index) {
            var Icon = step.icon;
            var isActive = currentStep === step.id;
            var isCompleted = index < currentStepIndex;
            return (<div key={step.id} className="flex items-center">
                <button onClick={function () { return setCurrentStep(step.id); }} className={"flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ".concat(isActive
                    ? 'bg-primary-500 text-white'
                    : isCompleted
                        ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                  <Icon className="w-4 h-4"/>
                  <span className="text-sm font-medium">{step.label}</span>
                </button>
                
                {index < steps.length - 1 && (<div className="w-8 h-0.5 bg-gray-200 mx-2"/>)}
              </div>);
        })}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-6 min-h-[500px]">
        {currentStep === 'languages' && (<div>
            {isAddingMore && selectedResources.size > 0 && (<div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-green-900 mb-1">
                      Adding More Resources
                    </div>
                    <div className="text-sm text-green-700">
                      You have {selectedResources.size} resource(s) in your package. 
                      Select additional languages to add more resources.
                    </div>
                  </div>
                  <button onClick={handleBackToManage} className="px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors text-sm">
                    Back to Manage
                  </button>
                </div>
              </div>)}
            <LanguageSelector_1.LanguageSelector />
          </div>)}
        {currentStep === 'organizations' && <OrganizationSelector_1.OrganizationSelector />}
        {currentStep === 'resources' && <ResourceSelector_1.ResourceSelector />}
        {currentStep === 'original-languages' && <OriginalLanguageSelector_1.OriginalLanguageSelector />}
        {currentStep === 'info' && <PackageInfoForm_1.PackageInfoForm />}
        {currentStep === 'manage' && (<div>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Manage Package Resources</h2>
                  <p className="text-gray-600 mt-1">
                    Review, remove, or add more resources to your package.
                  </p>
                </div>
                <button onClick={handleAddMoreResources} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                  <lucide_react_1.Plus className="w-5 h-5"/>
                  Add More Resources
                </button>
              </div>
            </div>
            <PackageResourceManager_1.PackageResourceManager />
          </div>)}
        {currentStep === 'preview' && (<ManifestPreview_1.ManifestPreview onAddMoreResources={handleAddMoreResources} onBackToManage={handleBackToManage}/>)}
      </div>

      {/* Navigation Buttons */}
      <div className="border-t border-gray-200 px-6 py-4 flex justify-between">
        <button onClick={handleBack} disabled={currentStepIndex === 0} className="px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          Back
        </button>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {selectedResources.size} resource{selectedResources.size !== 1 ? 's' : ''} selected
          </span>
          
          {currentStepIndex < steps.length - 1 ? (<button onClick={handleNext} disabled={!canProceed()} className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Next
            </button>) : null}
        </div>
      </div>
    </div>);
}
