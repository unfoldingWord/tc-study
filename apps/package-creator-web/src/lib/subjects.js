"use strict";
/**
 * Resource Subjects Configuration
 *
 * Re-exports shared configuration from @bt-synergy/package-builder
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_FILTERS = exports.DEFAULT_SUBJECTS = void 0;
exports.getActiveSubjects = getActiveSubjects;
var package_builder_1 = require("@bt-synergy/package-builder");
Object.defineProperty(exports, "DEFAULT_SUBJECTS", { enumerable: true, get: function () { return package_builder_1.DEFAULT_SUBJECTS; } });
Object.defineProperty(exports, "API_FILTERS", { enumerable: true, get: function () { return package_builder_1.DEFAULT_API_FILTERS; } });
/**
 * Get the current active subjects list
 * Can be extended to read from settings/config
 */
function getActiveSubjects() {
    // For now, return default subjects
    // In the future, this could read from localStorage or user settings
    return __spreadArray([], DEFAULT_SUBJECTS, true);
}
