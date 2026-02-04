# Biblical Virtues Exchange Game

A cooperative Christian game demonstrating the `@bt-synergy/resource-panels` library with inter-panel communication.

## 🎮 Game Overview

**Biblical Virtues Exchange** is a meaningful game where two players send blessings, prayers, and encouragement to biblical characters. It's designed to be:

- ✝️ **Christ-centered**: Based on real biblical characters and their virtues
- 🤝 **Cooperative**: Players work together to spread positivity
- 🎯 **Educational**: Learn about biblical characters and their stories
- 🚀 **Technical Demo**: Showcases the `resource-panels` library capabilities

## 🎯 How to Play

1. **Select Your Character**: Click on any of the 6 biblical characters
2. **Choose an Action**:
   - 🙏 **Send Blessing** - Bless with favor and grace
   - 🕊️ **Pray For** - Lift up in prayer
   - 💪 **Encourage** - Strengthen and uplift
   - ✨ **Share Virtue** - Share a virtue from your character
3. **Select Target**:
   - Pick a specific character in the other player's panel
   - Or target "All Characters" or "All Opponent Characters"
4. **Watch the Exchange**: See responses in the activity feed and track your score!

## 📚 Biblical Characters

The game features 6 beloved biblical characters:

1. **David** 👑 - Shepherd King (OT) - Courage, Worship, Leadership
2. **Esther** 👸 - Queen of Courage (OT) - Bravery, Wisdom, Sacrifice
3. **Moses** 🌊 - Deliverer (OT) - Faith, Perseverance, Humility
4. **Peter** 🪨 - The Rock (NT) - Boldness, Devotion, Transformation
5. **Mary** ⭐ - Mother of Jesus (NT) - Faith, Obedience, Humility
6. **Paul** ✍️ - Apostle (NT) - Perseverance, Faith, Teaching

## 🏗️ Technical Features

This app demonstrates key features of the `@bt-synergy/resource-panels` library:

### ✅ Inter-Panel Communication
- Send signals from one panel to another
- Receive and respond to incoming signals
- Real-time feedback and activity tracking

### ✅ Custom Signal Types
- `ActionSignal` - Send actions to characters
- `ResponseSignal` - Characters respond automatically
- `ScoreSignal` - Track player statistics
- `CharacterSelectedSignal` - Notify when characters are selected

### ✅ Flexible Targeting
- Target specific characters by ID
- Target all characters with `targetCharacterId: 'all'`
- Target all opponent characters with `targetCharacterId: 'all-opponents'`
- Target specific panels with `targetPanelId`

### ✅ Resource Metadata
- Each panel has its own resource instance
- Signals carry source and target information
- Message lifecycle management (ephemeral vs. persistent)

### ✅ React Hooks Integration
- `useResourcePanel()` - Access panel and resource context
- `useSignal<T>()` - Send typed signals
- `useSignalHandler<T>()` - Receive and handle typed signals

## 🚀 Running the App

```bash
# From the workspace root
cd apps/resource-panels-spike

# Install dependencies (if needed)
bun install

# Start the dev server
bun dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## 📦 Built With

- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **linked-panels** - Low-level panel messaging
- **@bt-synergy/resource-panels** - High-level resource communication wrapper
- **lucide-react** - Icons

## 🎨 Design Philosophy

This game follows the **BT Synergy Development Principles**:

1. **Minimal Localization** - Icon-first design, universally understandable
2. **DRY (Don't Repeat Yourself)** - Shared components and hooks
3. **Meaningful, Not Cheesy** - Respectful biblical content with engaging gameplay

## 🧪 What's Being Tested

1. **Two-Panel Architecture**: Each player has their own isolated panel
2. **Signal Broadcasting**: Actions sent from one panel to another
3. **Signal Filtering**: Signals targeted to specific characters or groups
4. **Response Mechanism**: Automatic responses to incoming actions
5. **State Management**: Independent state in each panel
6. **Real-time Updates**: Activity feed showing all interactions
7. **Score Tracking**: Statistics for actions given and received

## 📝 Code Structure

```
src/
├── components/
│   ├── CharacterCard.tsx      # Reusable character card component
│   └── CharacterGrid.tsx      # Main game resource (panel content)
├── data/
│   └── biblicalCharacters.ts  # Character data and action definitions
├── signals.ts                 # Custom signal type definitions
└── App.tsx                    # Main app with 2-panel layout
```

## 🎓 Learning Outcomes

By exploring this app, you'll understand how to:

- Set up multi-panel applications with `linked-panels`
- Create custom signal types with `BaseSignal`
- Use `useSignal` and `useSignalHandler` hooks
- Implement cooperative multi-player interactions
- Design icon-first, minimal-text UIs
- Build engaging, meaningful applications with Christian themes

## 🙏 Biblical Inspiration

> "Encourage one another and build each other up, just as in fact you are doing."
> — 1 Thessalonians 5:11

> "Therefore encourage one another with these words."
> — 1 Thessalonians 4:18

---

Built with ❤️ for demonstrating `@bt-synergy/resource-panels`
