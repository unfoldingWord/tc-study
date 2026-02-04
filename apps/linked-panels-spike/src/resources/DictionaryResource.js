"use strict";
/**
 * DictionaryResource - Displays word definitions
 * Receives word-click messages and shows definition
 * Sends highlighted-words-broadcast to highlight words with definitions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DictionaryResource = DictionaryResource;
var react_1 = require("react");
var linked_panels_1 = require("linked-panels");
// Sample dictionary
var DICTIONARY = {
    hello: {
        definition: 'A greeting or expression of goodwill',
        example: 'Hello! How are you today?',
    },
    world: {
        definition: 'The earth, together with all of its countries and peoples',
        example: 'We live in a beautiful world.',
    },
    simple: {
        definition: 'Easily understood or done; presenting no difficulty',
        example: 'The instructions were simple to follow.',
    },
    test: {
        definition: 'A procedure intended to establish the quality, performance, or reliability of something',
        example: 'This is a test of the system.',
    },
    communication: {
        definition: 'The imparting or exchanging of information by speaking, writing, or using some other medium',
        example: 'Good communication is essential for teamwork.',
    },
    system: {
        definition: 'A set of things working together as parts of a mechanism or an interconnecting network',
        example: 'The nervous system controls body functions.',
    },
};
function DictionaryResource(_a) {
    var resourceId = _a.resourceId;
    var api = (0, linked_panels_1.useResourceAPI)(resourceId);
    var _b = (0, react_1.useState)(null), selectedWord = _b[0], setSelectedWord = _b[1];
    var _c = (0, react_1.useState)(null), selectedWordId = _c[0], setSelectedWordId = _c[1];
    var _d = (0, react_1.useState)(null), definition = _d[0], setDefinition = _d[1];
    // Get all words that have definitions
    var wordsWithDefinitions = Object.keys(DICTIONARY);
    // Broadcast highlighted words
    var broadcastHighlightedWords = function (wordIds, selectedId, wordText) {
        var message = {
            type: 'highlighted-words-broadcast',
            lifecycle: 'state',
            stateKey: 'current-highlighted-words',
            wordIds: wordIds,
            selectedWordId: selectedId,
            sourceResourceId: resourceId,
            timestamp: Date.now(),
        };
        console.log('📤 DictionaryResource broadcasting highlighted words:', message, wordText ? "(word: ".concat(wordText, ")") : '');
        api.messaging.sendToAll(message);
    };
    // Handle clicking a word in the dictionary list (reverse direction!)
    var handleDictionaryWordClick = function (word) {
        console.log('🖱️ Dictionary word clicked:', word);
        // Set as selected
        setSelectedWord(word);
        setSelectedWordId(null); // We don't have a specific wordId from text
        setDefinition(DICTIONARY[word]);
        // Send a message to highlight all occurrences of this word in the text
        // This demonstrates REVERSE communication: Dictionary → Text
        var highlightMessage = {
            type: 'word-click',
            lifecycle: 'event',
            word: word,
            wordId: "dict-".concat(word), // Temporary ID
            position: -1, // Coming from dictionary, not text
            sourceResourceId: resourceId,
            timestamp: Date.now(),
        };
        console.log('📤 Dictionary sending reverse message to text panel');
        api.messaging.sendToAll(highlightMessage);
    };
    // Listen for word-click events using useEvents hook
    (0, linked_panels_1.useEvents)(resourceId, ['word-click'], function (message) {
        console.log('📨 DictionaryResource received word-click:', message);
        var word = message.word;
        var def = DICTIONARY[word];
        setSelectedWord(word);
        setSelectedWordId(message.wordId);
        setDefinition(def || null);
        // Broadcast highlighting for this word
        if (def) {
            broadcastHighlightedWords([message.wordId], message.wordId);
        }
        else {
            broadcastHighlightedWords([], null);
        }
    });
    return (<div style={{ padding: '24px', height: '100%', overflow: 'auto' }}>
      <h2 style={{ marginBottom: '16px', color: '#333' }}>Dictionary Resource</h2>

      {!selectedWord ? (<div style={{ padding: '24px', backgroundColor: '#f3f4f6', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            Click a word in the text panel to see its definition here.
          </p>
        </div>) : definition ? (<div style={{ backgroundColor: '#ffffff', border: '2px solid #10b981', borderRadius: '8px', padding: '20px' }}>
          <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px', color: '#059669' }}>
            {selectedWord}
          </h3>
          <div style={{ marginBottom: '16px' }}>
            <strong style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '12px' }}>
              Definition:
            </strong>
            <p style={{ fontSize: '16px', marginTop: '8px', color: '#374151' }}>
              {definition.definition}
            </p>
          </div>
          <div>
            <strong style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '12px' }}>
              Example:
            </strong>
            <p style={{ fontSize: '16px', marginTop: '8px', color: '#374151', fontStyle: 'italic' }}>
              "{definition.example}"
            </p>
          </div>
        </div>) : (<div style={{ backgroundColor: '#fef2f2', border: '2px solid #ef4444', borderRadius: '8px', padding: '20px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#dc2626' }}>
            Word not found
          </h3>
          <p style={{ color: '#991b1b' }}>
            No definition available for "{selectedWord}".
          </p>
        </div>)}

      <div style={{ marginTop: '32px', padding: '16px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
        <strong style={{ display: 'block', marginBottom: '8px', color: '#374151' }}>
          Available Definitions ({wordsWithDefinitions.length}) - Click to highlight in text:
        </strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {wordsWithDefinitions.map(function (word) { return (<span key={word} onClick={function () { return handleDictionaryWordClick(word); }} style={{
                padding: '4px 12px',
                backgroundColor: selectedWord === word ? '#10b981' : '#e5e7eb',
                color: selectedWord === word ? '#ffffff' : '#374151',
                borderRadius: '16px',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s',
            }} onMouseEnter={function (e) {
                if (selectedWord !== word) {
                    e.currentTarget.style.backgroundColor = '#d1d5db';
                }
            }} onMouseLeave={function (e) {
                if (selectedWord !== word) {
                    e.currentTarget.style.backgroundColor = '#e5e7eb';
                }
            }}>
              {word}
            </span>); })}
        </div>
        <p style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
          💡 Click a dictionary word to find and highlight it in the text panel
        </p>
      </div>
    </div>);
}
