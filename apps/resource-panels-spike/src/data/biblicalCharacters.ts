export interface BiblicalCharacter {
  id: number
  name: string
  title: string
  testament: 'OT' | 'NT'
  virtues: string[]
  story: string
  verse: string
  color: string
  emoji: string
}

export const BIBLICAL_CHARACTERS: BiblicalCharacter[] = [
  {
    id: 1,
    name: 'David',
    title: 'Shepherd King',
    testament: 'OT',
    virtues: ['Courage', 'Worship', 'Leadership'],
    story: 'Defeated Goliath with faith and became a king after God\'s own heart.',
    verse: 'The Lord is my shepherd; I shall not want. - Psalm 23:1',
    color: '#FFD700',
    emoji: '👑'
  },
  {
    id: 2,
    name: 'Esther',
    title: 'Queen of Courage',
    testament: 'OT',
    virtues: ['Bravery', 'Wisdom', 'Sacrifice'],
    story: 'Risked her life to save her people.',
    verse: 'For such a time as this. - Esther 4:14',
    color: '#FF69B4',
    emoji: '👸'
  },
  {
    id: 3,
    name: 'Moses',
    title: 'Deliverer',
    testament: 'OT',
    virtues: ['Faith', 'Perseverance', 'Humility'],
    story: 'Led the Israelites out of Egypt through God\'s power.',
    verse: 'I AM WHO I AM. - Exodus 3:14',
    color: '#4169E1',
    emoji: '🌊'
  },
  {
    id: 4,
    name: 'Peter',
    title: 'The Rock',
    testament: 'NT',
    virtues: ['Boldness', 'Devotion', 'Transform'],
    story: 'Denied Jesus but became a pillar of the church.',
    verse: 'On this rock I will build my church. - Matthew 16:18',
    color: '#708090',
    emoji: '🪨'
  },
  {
    id: 5,
    name: 'Mary',
    title: 'Mother of Jesus',
    testament: 'NT',
    virtues: ['Faith', 'Obedience', 'Humility'],
    story: 'Said yes to God\'s impossible plan.',
    verse: 'I am the Lord\'s servant. - Luke 1:38',
    color: '#87CEEB',
    emoji: '⭐'
  },
  {
    id: 6,
    name: 'Paul',
    title: 'Apostle',
    testament: 'NT',
    virtues: ['Perseverance', 'Faith', 'Teaching'],
    story: 'Transformed from persecutor to greatest missionary.',
    verse: 'I can do all things through Christ. - Phil 4:13',
    color: '#CD853F',
    emoji: '✍️'
  }
]

export const ACTIONS = [
  { id: 'blessing', name: 'Send Blessing', icon: '🙏', color: '#FFD700' },
  { id: 'prayer', name: 'Pray For', icon: '🕊️', color: '#87CEEB' },
  { id: 'encourage', name: 'Encourage', icon: '💪', color: '#FF6347' },
  { id: 'virtue', name: 'Share Virtue', icon: '✨', color: '#9370DB' }
]
