# Biblical Virtues Exchange - Game Design

## 🎮 Game Overview

**Biblical Virtues Exchange** is a cooperative Christian game designed to demonstrate the `@bt-synergy/resource-panels` library's inter-panel communication capabilities. The game creates a meaningful, engaging experience while testing advanced signal routing and multi-panel interactions.

## 🎯 Game Objectives

- **Primary Goal**: Send positive actions (blessings, prayers, encouragement, virtues) between biblical characters
- **Secondary Goal**: Demonstrate the resource-panels library's capabilities
- **Tertiary Goal**: Create an educational experience about biblical characters

## 👥 Players

- **2 Players** (each with their own panel)
- Each player controls their selection of biblical characters
- Players send actions to each other's characters
- Cooperative gameplay - no competition or conflict

## 📜 Biblical Characters

### Old Testament (OT)
1. **David** 👑 - Shepherd King
   - Virtues: Courage, Worship, Leadership
   - Story: Defeated Goliath with faith and became a king after God's own heart
   - Verse: "The Lord is my shepherd; I shall not want." - Psalm 23:1

2. **Esther** 👸 - Queen of Courage
   - Virtues: Bravery, Wisdom, Sacrifice
   - Story: Risked her life to save her people
   - Verse: "For such a time as this." - Esther 4:14

3. **Moses** 🌊 - Deliverer
   - Virtues: Faith, Perseverance, Humility
   - Story: Led the Israelites out of Egypt through God's power
   - Verse: "I AM WHO I AM." - Exodus 3:14

### New Testament (NT)
4. **Peter** 🪨 - The Rock
   - Virtues: Boldness, Devotion, Transformation
   - Story: Denied Jesus but became a pillar of the church
   - Verse: "On this rock I will build my church." - Matthew 16:18

5. **Mary** ⭐ - Mother of Jesus
   - Virtues: Faith, Obedience, Humility
   - Story: Said yes to God's impossible plan
   - Verse: "I am the Lord's servant." - Luke 1:38

6. **Paul** ✍️ - Apostle to Gentiles
   - Virtues: Perseverance, Faith, Teaching
   - Story: Transformed from persecutor to greatest missionary
   - Verse: "I can do all things through Christ." - Philippians 4:13

## 🎬 Game Actions

### 1. Send Blessing 🙏
- **Color**: Gold (#FFD700)
- **Effect**: Bless a character with favor and grace
- **Response**: "May God's grace be upon you" / "You are blessed and highly favored"

### 2. Pray For 🕊️
- **Color**: Sky Blue (#87CEEB)
- **Effect**: Lift a character up in prayer
- **Response**: "Lifting you up in prayer" / "Praying for strength and wisdom"

### 3. Encourage 💪
- **Color**: Tomato Red (#FF6347)
- **Effect**: Strengthen and uplift a character
- **Response**: "You can do all things through Christ!" / "Be strong and courageous!"

### 4. Share Virtue ✨
- **Color**: Purple (#9370DB)
- **Effect**: Share a virtue from your character
- **Response**: "Sharing the gift of faithfulness" / "May this virtue strengthen you"

## 🎲 Game Flow

### Turn Structure

1. **Selection Phase**
   - Player clicks on one of their 6 characters
   - Character card highlights with their color
   - Character is "activated" for the turn

2. **Action Phase**
   - Player chooses one of 4 actions (Blessing, Prayer, Encourage, Share Virtue)
   - Action button highlights when selected

3. **Targeting Phase**
   - **Individual Target**: Select specific character in opponent's panel
   - **Group Target - All**: Target all 6 characters in opponent's panel
   - **Group Target - All Opponents**: Target only opponent's characters

4. **Execution Phase**
   - Click "Send Action! 🚀" button
   - Signal is sent to target panel/character(s)
   - Activity feed updates for both players
   - Score increments (given/received)

5. **Response Phase**
   - Target character(s) automatically respond
   - Response message appears in activity feed
   - Target character briefly highlights (pulses for 2 seconds)

## 📊 Scoring System

### Player Stats
- **Given**: Number of actions sent to opponent
- **Received**: Number of actions received from opponent

### Display
- Large numbers displayed at top of each panel
- Color coded: Green for given, Blue for received
- Real-time updates during gameplay

## 🎨 UI Design

### Panel Layout
- **2 Panels**: Side-by-side (50/50 split)
- **Panel Colors**:
  - Panel 1: Blue border (#Blue-300)
  - Panel 2: Purple border (#Purple-300)

### Character Grid
- **3x2 Grid**: 3 columns, 2 rows
- **Card Design**:
  - Large emoji icon (character identifier)
  - Character name in their unique color
  - Title/role subtitle
  - Testament badge (OT/NT)
  - 3 virtue badges
  - Border highlights when selected

### Action Panel
- Appears below grid when character is selected
- **4 Action Buttons**: Large, icon-first design
- **Target Selection**:
  - 2 Group buttons (All, All Opponents)
  - 6 Individual character mini-cards
- **Execute Button**: Full-width, green, prominent

### Activity Feed
- Scrollable feed at bottom
- Most recent at top (reverse chronological)
- Max 10 messages displayed
- Gray rounded cards with message text
- Shows:
  - Actions sent ("David sent Blessing to Peter")
  - Actions received ("Received prayer from Mary")
  - Responses ("🕊️ Peter responds: 'Lifting you up in prayer'")

## 🔧 Technical Implementation

### Signal Types

```typescript
// Send action from Player 1 to Player 2
ActionSignal {
  type: 'action'
  action: {
    actionType: 'blessing' | 'prayer' | 'encourage' | 'virtue'
    sourceCharacterId: number
    sourceCharacterName: string
    targetCharacterId: number | 'all' | 'all-opponents'
    targetPanelId: string
    virtue?: string
  }
}

// Response sent back
ResponseSignal {
  type: 'response'
  response: {
    characterId: number
    characterName: string
    originalAction: string
    message: string
    emoji: string
  }
}
```

### Panel Communication
- Each panel has unique resource ID (`player1-grid`, `player2-grid`)
- Panels derive their panel ID (`panel-1`, `panel-2`) from resource ID
- Actions explicitly target opposite panel
- Responses automatically route back to sender

### State Management
- Independent state per panel
- Selected character tracked locally
- Target selection tracked locally
- Activity feed tracked locally
- Score tracked locally
- No shared state between panels (pure message passing)

## 🎓 Educational Value

### Biblical Learning
- Players learn about 6 key biblical characters
- Each character has:
  - Historical context (story summary)
  - Defining virtues (3 per character)
  - Scriptural reference (verse)
  - Testament classification (OT/NT)

### Spiritual Themes
- **Encouragement**: Central gameplay mechanic
- **Prayer**: Modeled as active, purposeful action
- **Blessing**: Shown as transferable grace
- **Virtue**: Presented as shareable qualities

### Design Philosophy
- **Non-cheesy**: Respectful, authentic biblical content
- **Non-violent**: Cooperative, not competitive
- **Meaningful**: Actions have spiritual significance
- **Fun**: Engaging mechanics, visual feedback

## 🚀 Future Enhancements

### Potential Additions
1. **More Characters**: Expand to 12+ biblical figures
2. **Character Stories**: Expandable cards with full narratives
3. **Virtue Combinations**: Special effects when matching virtues
4. **Team Play**: 3+ players, alliances
5. **Missions**: Specific goals ("Send blessings to all OT characters")
6. **Achievements**: Track milestones
7. **Multiplayer**: Network play across devices
8. **Persistence**: Save game state, track history

### Technical Improvements
1. **Animations**: Smoother transitions, particle effects
2. **Sound Effects**: Gentle, reverent audio feedback
3. **Accessibility**: Screen reader support, keyboard navigation
4. **Localization**: Multi-language support (while keeping icon-first design)
5. **Performance**: Optimize for 4+ panels, 20+ characters

## 📖 Biblical References

The game draws inspiration from these passages:

> "Encourage one another and build each other up, just as in fact you are doing."  
> — 1 Thessalonians 5:11

> "Therefore encourage one another with these words."  
> — 1 Thessalonians 4:18

> "And let us consider how we may spur one another on toward love and good deeds."  
> — Hebrews 10:24

> "The tongue has the power of life and death, and those who love it will eat its fruit."  
> — Proverbs 18:21

---

**Built with ❤️ to demonstrate `@bt-synergy/resource-panels` and honor biblical characters**
