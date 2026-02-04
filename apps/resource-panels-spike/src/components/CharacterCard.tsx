import type { BiblicalCharacter } from '../data/biblicalCharacters'

interface CharacterCardProps {
  character: BiblicalCharacter
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  highlight?: 'receiving' | 'sending'
  showActions?: boolean
  onAction?: (actionType: string) => void
  size?: 'small' | 'medium' | 'large'
}

export function CharacterCard({
  character,
  selected = false,
  onClick,
  disabled = false,
  highlight,
  showActions = false,
  onAction,
  size = 'medium'
}: CharacterCardProps) {
  const sizeClasses = {
    small: 'p-3',
    medium: 'p-4',
    large: 'p-6'
  }

  const emojiSizes = {
    small: 'text-3xl',
    medium: 'text-4xl',
    large: 'text-5xl'
  }

  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`
        ${sizeClasses[size]}
        border-3 rounded-xl transition-all duration-200
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105 hover:shadow-lg'}
        ${selected ? 'border-blue-500 bg-blue-50 shadow-lg scale-105' : 'border-gray-300 bg-white'}
        ${highlight === 'receiving' ? 'animate-pulse border-green-500 bg-green-50' : ''}
        ${highlight === 'sending' ? 'animate-pulse border-yellow-500 bg-yellow-50' : ''}
      `}
      style={{
        borderColor: selected ? character.color : undefined
      }}
    >
      <div className="text-center">
        {/* Character Emoji */}
        <div className={`${emojiSizes[size]} mb-2`}>{character.emoji}</div>
        
        {/* Character Name */}
        <div className="font-bold text-lg mb-1" style={{ color: character.color }}>
          {character.name}
        </div>
        
        {/* Title */}
        <div className="text-sm text-gray-600 mb-2">{character.title}</div>
        
        {/* Testament Badge */}
        <div className={`
          inline-block px-2 py-1 rounded text-xs font-semibold mb-2
          ${character.testament === 'OT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}
        `}>
          {character.testament}
        </div>
        
        {/* Virtues */}
        {size !== 'small' && (
          <div className="flex flex-wrap gap-1 justify-center mt-2">
            {character.virtues.map((virtue, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs"
              >
                {virtue}
              </span>
            ))}
          </div>
        )}
        
        {/* Story (only on large) */}
        {size === 'large' && (
          <>
            <p className="text-sm text-gray-700 mt-3 mb-2">{character.story}</p>
            <p className="text-xs italic text-gray-500 mt-2">{character.verse}</p>
          </>
        )}
        
        {/* Action Buttons */}
        {showActions && onAction && (
          <div className="mt-3 flex gap-2 justify-center">
            <button
              onClick={(e) => { e.stopPropagation(); onAction('blessing') }}
              className="p-2 hover:bg-yellow-100 rounded-lg transition-colors"
              title="Send Blessing"
            >
              🙏
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction('prayer') }}
              className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
              title="Pray For"
            >
              🕊️
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction('encourage') }}
              className="p-2 hover:bg-red-100 rounded-lg transition-colors"
              title="Encourage"
            >
              💪
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction('virtue') }}
              className="p-2 hover:bg-purple-100 rounded-lg transition-colors"
              title="Share Virtue"
            >
              ✨
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

