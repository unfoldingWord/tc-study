/** bible-story-builder's OBS files as a fixture: every frame of every story, each telling `ref` (Titus 1:1 by default). */
import { OBS_FRAMES_PER_STORY } from '@bt-synergy/language-pack-v3'

export function framesFixture(ref = 'TIT 1:1'): Map<string, string> {
  const files = new Map<string, string>()
  OBS_FRAMES_PER_STORY.forEach((n, i) => {
    const ss = String(i + 1).padStart(2, '0')
    let text = `[[story:${ss}]]\n`
    for (let f = 1; f <= n; f++) text += `![Image](obs-en-${ss}-${String(f).padStart(2, '0')}.jpg)\n[[ref:${ref}]]\n`
    files.set(`${String(Math.ceil((i + 1) / 5)).padStart(2, '0')}/${ss}.md`, text)
  })
  return files
}
