"use strict";
/**
 * Transparent chapter-level storage for book-organized resources (scripture, TN, TQ).
 * The adapter uses this to split one logical entry into a manifest + one record per chapter,
 * and to reassemble on get, without changing the public get/set API.
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
exports.CHUNKED_MARKER = exports.BOOK_ORGANIZED_PREFIXES = void 0;
exports.isBookOrganizedKey = isBookOrganizedKey;
exports.isChapterSubKey = isChapterSubKey;
exports.toLogicalKey = toLogicalKey;
exports.isChunkedManifest = isChunkedManifest;
exports.canSplitScripture = canSplitScripture;
exports.splitScriptureEntry = splitScriptureEntry;
exports.reassembleScripture = reassembleScripture;
exports.canSplitNotes = canSplitNotes;
exports.splitNotesEntry = splitNotesEntry;
exports.reassembleNotes = reassembleNotes;
exports.canSplitQuestions = canSplitQuestions;
exports.splitQuestionsEntry = splitQuestionsEntry;
exports.reassembleQuestions = reassembleQuestions;
exports.canSplitBookEntry = canSplitBookEntry;
exports.splitBookEntry = splitBookEntry;
exports.reassembleBookEntry = reassembleBookEntry;
/** Key prefixes for book-organized resources that we store by chapter. */
exports.BOOK_ORGANIZED_PREFIXES = ['scripture:', 'tn:', 'tq:'];
/** Marker in stored entry to indicate chunked (manifest-only) record. */
exports.CHUNKED_MARKER = '_chunkedBook';
function isBookOrganizedKey(key) {
    return exports.BOOK_ORGANIZED_PREFIXES.some(function (p) { return key.startsWith(p); });
}
/**
 * Returns true if this key is a chapter sub-key (e.g. scripture:owner/lang/id:gen:1).
 * Used to filter keys() to logical keys only.
 */
function isChapterSubKey(key) {
    if (!isBookOrganizedKey(key))
        return false;
    var parts = key.split(':');
    var last = parts[parts.length - 1];
    return /^\d+$/.test(last) && parts.length > 1;
}
/**
 * Map a raw key to its logical key (base key for book-organized entries).
 * e.g. scripture:owner/lang/id:gen:1 -> scripture:owner/lang/id:gen
 */
function toLogicalKey(key) {
    if (!isChapterSubKey(key))
        return key;
    var lastColon = key.lastIndexOf(':');
    return lastColon > 0 ? key.slice(0, lastColon) : key;
}
/**
 * Check if entry is a chunked manifest (has marker, no full content).
 */
function isChunkedManifest(entry) {
    var _a;
    var e = entry;
    return (((_a = e === null || e === void 0 ? void 0 : e.metadata) === null || _a === void 0 ? void 0 : _a[exports.CHUNKED_MARKER]) === true ||
        (e === null || e === void 0 ? void 0 : e[exports.CHUNKED_MARKER]) === true ||
        ((e === null || e === void 0 ? void 0 : e.content) && typeof e.content === 'object' && e.content[exports.CHUNKED_MARKER] === true));
}
// --- Scripture: entry.content.chapters (array) ---
function isScriptureEntry(entry) {
    var _a;
    var c = (_a = entry.content) !== null && _a !== void 0 ? _a : entry;
    return Array.isArray(c === null || c === void 0 ? void 0 : c.chapters);
}
function scriptureChapters(entry) {
    var _a;
    var content = entry.content;
    return { metadata: content.metadata, chapters: (_a = content.chapters) !== null && _a !== void 0 ? _a : [] };
}
function canSplitScripture(key, entry) {
    var _a;
    return key.startsWith('scripture:') && isScriptureEntry(entry) && ((_a = entry.content.chapters) === null || _a === void 0 ? void 0 : _a.length) > 0;
}
function splitScriptureEntry(key, entry) {
    var _a, _b;
    var _c = scriptureChapters(entry), metadata = _c.metadata, chapters = _c.chapters;
    var manifestEntry = __assign(__assign({}, entry), { content: (_a = { metadata: metadata }, _a[exports.CHUNKED_MARKER] = true, _a), metadata: __assign(__assign({}, entry.metadata), (_b = {}, _b[exports.CHUNKED_MARKER] = true, _b)) });
    var chapterEntries = chapters.map(function (ch, i) {
        var _a;
        var chapterNum = (_a = ch === null || ch === void 0 ? void 0 : ch.number) !== null && _a !== void 0 ? _a : i + 1;
        return {
            key: "".concat(key, ":").concat(chapterNum),
            entry: __assign(__assign({}, entry), { content: ch }),
        };
    });
    return { manifestEntry: manifestEntry, chapterEntries: chapterEntries };
}
function reassembleScripture(manifestEntry, chapterEntries) {
    var content = manifestEntry.content;
    var metadata = content === null || content === void 0 ? void 0 : content.metadata;
    var chapters = chapterEntries
        .sort(function (a, b) {
        var _a, _b;
        var na = parseInt((_a = a.key.split(':').pop()) !== null && _a !== void 0 ? _a : '0', 10);
        var nb = parseInt((_b = b.key.split(':').pop()) !== null && _b !== void 0 ? _b : '0', 10);
        return na - nb;
    })
        .map(function (c) { return c.entry.content; });
    return __assign(__assign({}, manifestEntry), { content: __assign(__assign({}, content), { metadata: metadata, chapters: chapters }), metadata: manifestEntry.metadata ? __assign({}, manifestEntry.metadata) : undefined });
}
// --- TN: entry.notesByChapter (Record<string, TranslationNote[]>) ---
function isNotesEntry(entry) {
    var e = entry;
    return typeof (e === null || e === void 0 ? void 0 : e.notesByChapter) === 'object' && e.notesByChapter !== null && !Array.isArray(e.notesByChapter);
}
function notesByChapter(entry) {
    var _a;
    var e = entry;
    return (_a = e.notesByChapter) !== null && _a !== void 0 ? _a : {};
}
function canSplitNotes(key, entry) {
    return key.startsWith('tn:') && isNotesEntry(entry) && Object.keys(notesByChapter(entry)).length > 0;
}
function splitNotesEntry(key, entry) {
    var _a, _b;
    var byChapter = notesByChapter(entry);
    var entryAny = entry;
    var rest = Object.fromEntries(Object.entries(entryAny).filter(function (_a) {
        var k = _a[0];
        return k !== 'notesByChapter' && k !== 'notes';
    }));
    var meta = entryAny.metadata && typeof entryAny.metadata === 'object' ? entryAny.metadata : {};
    var manifestEntry = __assign(__assign({ content: {} }, rest), (_a = { notesByChapter: {}, notes: [], metadata: __assign(__assign({}, meta), (_b = {}, _b[exports.CHUNKED_MARKER] = true, _b)) }, _a[exports.CHUNKED_MARKER] = true, _a));
    var chapterEntries = Object.entries(byChapter).map(function (_a) {
        var chapterNum = _a[0], notes = _a[1];
        return ({
            key: "".concat(key, ":").concat(chapterNum),
            entry: { content: { notes: notes }, metadata: entryAny.metadata },
        });
    });
    return { manifestEntry: manifestEntry, chapterEntries: chapterEntries };
}
function reassembleNotes(manifestEntry, chapterEntries) {
    var _a, _b, _c;
    var base = manifestEntry;
    var out = {};
    var notes = [];
    for (var _i = 0, chapterEntries_1 = chapterEntries; _i < chapterEntries_1.length; _i++) {
        var _d = chapterEntries_1[_i], chKey = _d.key, chEntry = _d.entry;
        var chapterNum = (_a = chKey.split(':').pop()) !== null && _a !== void 0 ? _a : '0';
        var chAny = chEntry;
        var chContent = chAny.content;
        var arr = (_c = (_b = chContent === null || chContent === void 0 ? void 0 : chContent.notes) !== null && _b !== void 0 ? _b : chAny.notes) !== null && _c !== void 0 ? _c : [];
        out[chapterNum] = Array.isArray(arr) ? arr : [];
        notes = notes.concat(out[chapterNum]);
    }
    var restored = __assign(__assign({}, base), { notesByChapter: out, notes: notes });
    delete restored[exports.CHUNKED_MARKER];
    if (restored.metadata && typeof restored.metadata === 'object')
        delete restored.metadata[exports.CHUNKED_MARKER];
    return restored;
}
// --- TQ: entry.questionsByChapter ---
function isQuestionsEntry(entry) {
    var e = entry;
    return typeof (e === null || e === void 0 ? void 0 : e.questionsByChapter) === 'object' && e.questionsByChapter !== null && !Array.isArray(e.questionsByChapter);
}
function questionsByChapter(entry) {
    var _a;
    var e = entry;
    return (_a = e.questionsByChapter) !== null && _a !== void 0 ? _a : {};
}
function canSplitQuestions(key, entry) {
    return key.startsWith('tq:') && isQuestionsEntry(entry) && Object.keys(questionsByChapter(entry)).length > 0;
}
function splitQuestionsEntry(key, entry) {
    var _a, _b;
    var byChapter = questionsByChapter(entry);
    var entryAny = entry;
    var rest = Object.fromEntries(Object.entries(entryAny).filter(function (_a) {
        var k = _a[0];
        return k !== 'questionsByChapter' && k !== 'questions';
    }));
    var meta = entryAny.metadata && typeof entryAny.metadata === 'object' ? entryAny.metadata : {};
    var manifestEntry = __assign(__assign({ content: {} }, rest), (_a = { questionsByChapter: {}, questions: [], metadata: __assign(__assign({}, meta), (_b = {}, _b[exports.CHUNKED_MARKER] = true, _b)) }, _a[exports.CHUNKED_MARKER] = true, _a));
    var chapterEntries = Object.entries(byChapter).map(function (_a) {
        var chapterNum = _a[0], questions = _a[1];
        return ({
            key: "".concat(key, ":").concat(chapterNum),
            entry: { content: { questions: questions }, metadata: entryAny.metadata },
        });
    });
    return { manifestEntry: manifestEntry, chapterEntries: chapterEntries };
}
function reassembleQuestions(manifestEntry, chapterEntries) {
    var _a, _b, _c;
    var base = manifestEntry;
    var out = {};
    var questions = [];
    for (var _i = 0, chapterEntries_2 = chapterEntries; _i < chapterEntries_2.length; _i++) {
        var _d = chapterEntries_2[_i], chKey = _d.key, chEntry = _d.entry;
        var chapterNum = (_a = chKey.split(':').pop()) !== null && _a !== void 0 ? _a : '0';
        var chAny = chEntry;
        var chContent = chAny.content;
        var arr = (_c = (_b = chContent === null || chContent === void 0 ? void 0 : chContent.questions) !== null && _b !== void 0 ? _b : chAny.questions) !== null && _c !== void 0 ? _c : [];
        out[chapterNum] = Array.isArray(arr) ? arr : [];
        questions = questions.concat(out[chapterNum]);
    }
    var restored = __assign(__assign({}, base), { questionsByChapter: out, questions: questions });
    delete restored[exports.CHUNKED_MARKER];
    if (restored.metadata && typeof restored.metadata === 'object')
        delete restored.metadata[exports.CHUNKED_MARKER];
    return restored;
}
// --- Unified split / reassemble ---
function canSplitBookEntry(key, entry) {
    return canSplitScripture(key, entry) || canSplitNotes(key, entry) || canSplitQuestions(key, entry);
}
function splitBookEntry(key, entry) {
    if (canSplitScripture(key, entry))
        return splitScriptureEntry(key, entry);
    if (canSplitNotes(key, entry))
        return splitNotesEntry(key, entry);
    if (canSplitQuestions(key, entry))
        return splitQuestionsEntry(key, entry);
    return { manifestEntry: entry, chapterEntries: [] };
}
function reassembleBookEntry(key, manifestEntry, chapterEntries) {
    if (key.startsWith('scripture:'))
        return reassembleScripture(manifestEntry, chapterEntries);
    if (key.startsWith('tn:'))
        return reassembleNotes(manifestEntry, chapterEntries);
    if (key.startsWith('tq:'))
        return reassembleQuestions(manifestEntry, chapterEntries);
    return manifestEntry;
}
