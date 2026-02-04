"use strict";
/**
 * Door43 Original Language Adapter
 *
 * Fetches and parses original language (Greek/Hebrew) scripture
 * This is essentially the same as ScriptureAdapter
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OriginalAdapter = void 0;
var scripture_adapter_1 = require("./scripture-adapter");
var OriginalAdapter = /** @class */ (function (_super) {
    __extends(OriginalAdapter, _super);
    function OriginalAdapter(httpClient) {
        return _super.call(this, httpClient) || this;
    }
    OriginalAdapter.prototype.getSupportedTypes = function () {
        return [
            'Greek New Testament',
            'Hebrew Old Testament',
            'original-language',
        ];
    };
    return OriginalAdapter;
}(scripture_adapter_1.ScriptureAdapter));
exports.OriginalAdapter = OriginalAdapter;
