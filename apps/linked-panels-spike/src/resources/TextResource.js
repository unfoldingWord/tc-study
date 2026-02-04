"use strict";
/**
 * TextResource - Displays text with clickable words
 * Sends word-click messages when user clicks a word
 * Receives highlighted-words-broadcast to apply highlighting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextResource = TextResource;
var react_1 = require("react");
var linked_panels_1 = require("linked-panels");
function TextResource(_a) {
    var text = _a.text, resourceId = _a.resourceId;
    var api = (0, linked_panels_1.useResourceAPI)(resourceId);
    // Local state for highlighting (fallback when useCurrentState doesn't update)
    var _b = (0, react_1.useState)([]), localHighlightedWords = _b[0], setLocalHighlightedWords = _b[1];
    var _c = (0, react_1.useState)(null), localSelectedWord = _c[0], setLocalSelectedWord = _c[1];
    // Parse text into words with IDs
    var words = text.split(/\s+/).map(function (word, idx) { return ({
        id: "word-".concat(idx),
        text: word,
        position: idx,
    }); });
    // Listen for highlighted-words-broadcast state messages (from dictionary)
    var highlightState = (0, linked_panels_1.useCurrentState)(resourceId, 'current-highlighted-words');
    // Listen for word-click events from dictionary (for reverse highlighting)
    (0, linked_panels_1.useEvents)(resourceId, ['word-click'], function (message) {
        // If this message came from dictionary (position: -1), highlight matching words
        if (message.position === -1 && message.sourceResourceId !== resourceId) {
            console.log('📨 TextResource received dictionary click:', message.word);
            // Find all matching word IDs
            var matchingWordIds = words
                .filter(function (w) { return w.text.toLowerCase().replace(/[.,!?;:]/g, '') === message.word; })
                .map(function (w) { return w.id; });
            console.log('🔍 Found matching words:', matchingWordIds);
            if (matchingWordIds.length > 0) {
                // UPDATE LOCAL STATE IMMEDIATELY (don't wait for broadcast to come back)
                setLocalHighlightedWords(matchingWordIds);
                setLocalSelectedWord(matchingWordIds[0]);
                console.log('✨ Applied local highlights:', matchingWordIds);
                // Also send highlight broadcast for other resources
                var highlightMsg = {
                    type: 'highlighted-words-broadcast',
                    lifecycle: 'state',
                    stateKey: 'current-highlighted-words',
                    wordIds: matchingWordIds,
                    selectedWordId: matchingWordIds[0],
                    sourceResourceId: resourceId,
                    timestamp: Date.now(),
                };
                console.log('📤 TextResource broadcasting highlights for dictionary word:', highlightMsg);
                api.messaging.sendToAll(highlightMsg);
            }
            else {
                console.log('⚠️ No matching words found for:', message.word);
                setLocalHighlightedWords([]);
                setLocalSelectedWord(null);
            }
        }
    });
    // Combine local state with broadcast state
    var highlightedWords = localHighlightedWords.length > 0
        ? localHighlightedWords
        : ((highlightState === null || highlightState === void 0 ? void 0 : highlightState.wordIds) || []);
    var selectedWordId = localSelectedWord || (highlightState === null || highlightState === void 0 ? void 0 : highlightState.selectedWordId);
    // Handle word click
    var handleWordClick = function (word) {
        console.log('🖱️ Word clicked:', word.text);
        // Send word-click event message
        var message = {
            type: 'word-click',
            lifecycle: 'event',
            word: word.text.toLowerCase().replace(/[.,!?;:]/g, ''),
            wordId: word.id,
            position: word.position,
            sourceResourceId: resourceId,
            timestamp: Date.now(),
        };
        // Broadcast to all resources
        api.messaging.sendToAll(message);
    };
    return (<div style={{ padding: '24px', lineHeight: '2' }}>
      <h2 style={{ marginBottom: '16px', color: '#333' }}>Text Resource</h2>
      <div style={{ fontSize: '18px' }}>
        {words.map(function (word, idx) {
            var isHighlighted = highlightedWords.includes(word.id);
            var isSelected = selectedWordId === word.id;
            return (<span key={word.id}>
              <span onClick={function () { return handleWordClick(word); }} style={{
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '3px',
                    backgroundColor: isSelected
                        ? '#fbbf24'
                        : isHighlighted
                            ? '#fef3c7'
                            : 'transparent',
                    fontWeight: isSelected ? 'bold' : 'normal',
                    transition: 'all 0.2s',
                }} onMouseEnter={function (e) {
                    if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }
                }} onMouseLeave={function (e) {
                    if (!isSelected) {
                        e.currentTarget.style.backgroundColor = isHighlighted
                            ? '#fef3c7'
                            : 'transparent';
                    }
                }}>
                {word.text}
              </span>
              {idx < words.length - 1 && ' '}
            </span>);
        })}
      </div>
      
      <div style={{ marginTop: '24px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px', fontSize: '14px' }}>
        <strong>Instructions:</strong> Click any word to look it up in the dictionary panel.
        <br />
        <strong>Status:</strong> {highlightedWords.length} words highlighted
        <br />
        <small style={{ color: '#6b7280' }}>
          Highlighted words: {highlightedWords.length > 0 ? highlightedWords.join(', ') : 'none'}
        </small>
      </div>
    </div>);
}
