/**
 * Biblical Virtues Exchange Game
 * 
 * A cooperative Christian game demonstrating resource-panels library
 */

import { LinkedPanel, LinkedPanelsContainer, type LinkedPanelsConfig } from 'linked-panels'
import './App.css'
import { CharacterGrid } from './components/CharacterGrid'

const config: LinkedPanelsConfig = {
  resources: [
    {
      id: 'player1-grid',
      component: <CharacterGrid resourceId="player1-grid" />
    },
    {
      id: 'player2-grid',
      component: <CharacterGrid resourceId="player2-grid" />
    }
  ],
  panels: {
    'panel-1': {
      resourceIds: ['player1-grid']
    },
    'panel-2': {
      resourceIds: ['player2-grid']
    }
  }
}

function App() {
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-amber-50 via-blue-50 to-purple-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 border-b-2 border-white shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-4xl">✝️</div>
              <div>
                <h1 className="text-3xl font-bold text-white drop-shadow-lg">
                  Biblical Virtues Exchange
                </h1>
                <p className="text-sm text-white/90">
                  Send blessings, prayers, and encouragement to biblical characters
                </p>
              </div>
            </div>
            <div className="flex gap-6 text-white">
              <div className="text-center">
                <div className="text-2xl">🙏</div>
                <div className="text-xs">Blessing</div>
              </div>
              <div className="text-center">
                <div className="text-2xl">🕊️</div>
                <div className="text-xs">Prayer</div>
              </div>
              <div className="text-center">
                <div className="text-2xl">💪</div>
                <div className="text-xs">Encourage</div>
              </div>
              <div className="text-center">
                <div className="text-2xl">✨</div>
                <div className="text-xs">Virtue</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - 2 Player Panels */}
      <div className="flex-1 overflow-hidden">
        <LinkedPanelsContainer config={config}>
          <div className="h-full grid grid-cols-2 gap-2 p-2">
            {/* Player 1 Panel */}
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden border-4 border-blue-300">
              <LinkedPanel id="panel-1">
                {({ current }) => (
                  <div className="h-full">
                    {current.resource?.component}
                  </div>
                )}
              </LinkedPanel>
            </div>

            {/* Player 2 Panel */}
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden border-4 border-purple-300">
              <LinkedPanel id="panel-2">
                {({ current }) => (
                  <div className="h-full">
                    {current.resource?.component}
                  </div>
                )}
              </LinkedPanel>
            </div>
          </div>
        </LinkedPanelsContainer>
      </div>

      {/* Footer - How to Play */}
      <footer className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 border-t-2 border-white p-4">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="bg-white/20 backdrop-blur p-3 rounded-lg border border-white/30">
              <div className="font-bold text-white mb-1">1️⃣ Select Your Character</div>
              <div className="text-white/90">Click on a biblical character card to select them</div>
            </div>
            <div className="bg-white/20 backdrop-blur p-3 rounded-lg border border-white/30">
              <div className="font-bold text-white mb-1">2️⃣ Choose an Action</div>
              <div className="text-white/90">Pick Blessing, Prayer, Encouragement, or Share Virtue</div>
            </div>
            <div className="bg-white/20 backdrop-blur p-3 rounded-lg border border-white/30">
              <div className="font-bold text-white mb-1">3️⃣ Select Target</div>
              <div className="text-white/90">Choose a specific character or target all</div>
            </div>
            <div className="bg-white/20 backdrop-blur p-3 rounded-lg border border-white/30">
              <div className="font-bold text-white mb-1">4️⃣ Watch the Exchange!</div>
              <div className="text-white/90">See responses in the activity feed</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
